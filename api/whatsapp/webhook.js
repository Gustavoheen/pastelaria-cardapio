/**
 * Webhook principal do bot WhatsApp — recebe eventos da Evolution API
 *
 * Fluxo de conversa:
 * 1. Primeira msg → saudação + link cardápio
 * 2. Segunda msg → link novamente + "tem dúvida?"
 * 3. Terceira msg → direciona para atendente
 * 4. Human takeover → bot para de interagir
 *
 * Fora do horário → informa horário de funcionamento
 * Palavra "pix" + pedido ativo → envia código copia e cola
 */

const { createClient } = require('@supabase/supabase-js')
const { enviarTexto } = require('../_lib/evolution')
const { gerarPixCopiaCola } = require('../_lib/pix')

// pastel schema — store_state, carioca_orders
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)
// public schema — carioca_whatsapp_sessions (criada sem prefixo de schema)
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const LINK_CARDAPIO = 'https://pasteldocariocavrb.com.br'
const SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000 // 6h — reseta sessão

// ─── Helpers ───────────────────────────────────────────────

function limparTelefone(jid) {
  // "5532999999999@s.whatsapp.net" → "5532999999999"
  return (jid || '').replace(/@.*$/, '').replace(/\D/g, '')
}

function extrairTextoMensagem(msg) {
  if (!msg) return ''
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim()
}

async function buscarConfig() {
  const { data } = await supabase
    .from('store_state')
    .select('*')
    .limit(1)
    .single()
  return data || {}
}

function estaAberto(config) {
  const status = config.status
  if (status === 'fechada') return false
  if (status === 'aberta') return true
  // status === 'auto' → checar horário
  const agora = new Date()
  const abertura = config.horario_abertura || '10:00'
  const fechamento = config.horario_fechamento || '22:00'
  const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  return horaAtual >= abertura && horaAtual <= fechamento
}

function nomeDia(num) {
  return ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][num]
}

function formatarDiasFuncionamento(diasFunc) {
  if (!diasFunc || !Array.isArray(diasFunc) || diasFunc.length === 0) return 'todos os dias'
  const diasMap = { dom: 'Domingo', seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado' }
  return diasFunc.map(d => diasMap[d] || d).join(', ')
}

async function buscarSessao(telefone) {
  const { data } = await supabasePublic
    .from('carioca_whatsapp_sessions')
    .select('*')
    .eq('telefone', telefone)
    .single()
  return data
}

async function upsertSessao(telefone, updates) {
  const { data } = await supabasePublic
    .from('carioca_whatsapp_sessions')
    .upsert(
      { telefone, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'telefone' }
    )
    .select()
    .single()
  return data
}

async function salvarBotMsgId(telefone, msgId) {
  if (!msgId) return
  const sessao = await buscarSessao(telefone)
  const ids = (sessao?.bot_msg_ids || []).slice(-20) // manter últimas 20
  ids.push(msgId)
  await supabasePublic
    .from('carioca_whatsapp_sessions')
    .update({ bot_msg_ids: ids, updated_at: new Date().toISOString() })
    .eq('telefone', telefone)
}

async function enviarBot(telefone, texto) {
  // Marcar timestamp ANTES de enviar — protege contra race condition
  // (o echo fromMe pode chegar antes do msgId ser salvo)
  const sessao = await buscarSessao(telefone)
  const ids = (sessao?.bot_msg_ids || []).filter(id => !id.startsWith('__ts:')).slice(-20)
  ids.push(`__ts:${Date.now()}`)
  await supabasePublic
    .from('carioca_whatsapp_sessions')
    .update({ bot_msg_ids: ids, updated_at: new Date().toISOString() })
    .eq('telefone', telefone)

  const result = await enviarTexto(telefone, texto)
  const msgId = result?.key?.id || result?.messageId || null
  await salvarBotMsgId(telefone, msgId)
  return result
}

async function buscarPedidoAtivo(telefone) {
  const telLimpo = telefone.replace(/^55/, '')
  const { data } = await supabase
    .from('carioca_orders') // pastel.carioca_orders
    .select('*')
    .or(`telefone.eq.${telefone},telefone.eq.${telLimpo}`)
    .in('status', ['recebido', 'preparando', 'pronto'])
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0] || null
}

// ─── Main handler ──────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Webhook receives calls from Evolution API server — restrict CORS
  const allowedOrigin = process.env.EVOLUTION_API_URL ? new URL(process.env.EVOLUTION_API_URL).origin : '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  // TODO: Add webhook signature validation (HMAC) when Evolution API supports it
  // For now, validate shared secret via query param or header
  const webhookSecret = process.env.WEBHOOK_SECRET
  if (webhookSecret) {
    const provided = req.query.secret || req.headers['x-webhook-secret']
    if (provided !== webhookSecret) {
      return res.status(401).json({ error: 'Nao autorizado.' })
    }
  }

  try {
    const body = req.body
    const event = body.event

    // Só processa mensagens (aceita ambos formatos: v1 lowercase e v2 UPPERCASE)
    const eventNorm = (event || '').toUpperCase().replace(/\./g, '_')
    if (eventNorm !== 'MESSAGES_UPSERT') return res.status(200).json({ ok: true, skip: event })

    const data = body.data
    if (!data?.key?.remoteJid) return res.status(200).json({ ok: true, skip: 'no jid' })

    // Ignorar grupos e broadcasts
    const jid = data.key.remoteJid || ''
    if (jid.includes('@g.us') || jid.includes('@broadcast') || jid === 'status@broadcast') {
      return res.status(200).json({ ok: true, skip: 'group_or_broadcast' })
    }

    const telefone = limparTelefone(jid)
    // Ignorar JIDs inválidos (telefone BR tem 12-13 dígitos)
    if (telefone.length < 10 || telefone.length > 15) {
      return res.status(200).json({ ok: true, skip: 'invalid_jid' })
    }

    const fromMe = data.key.fromMe === true
    const msgId = data.key.id
    const nomeContato = data.pushName || ''

    // ─── DETECÇÃO DE HUMAN TAKEOVER ───
    if (fromMe) {
      const sessao = await buscarSessao(telefone)
      const botIds = sessao?.bot_msg_ids || []

      // Se é um echo do bot (msgId conhecido), ignorar
      if (botIds.includes(msgId)) {
        return res.status(200).json({ ok: true, handled: 'bot_echo' })
      }

      // Grace period: se o bot enviou msg nos últimos 30s, é echo (race condition)
      const tsMarker = botIds.find(id => id.startsWith('__ts:'))
      if (tsMarker) {
        const ts = Number(tsMarker.replace('__ts:', ''))
        if (Date.now() - ts < 30000) {
          return res.status(200).json({ ok: true, handled: 'bot_echo_grace' })
        }
      }

      // Mensagem enviada por humano (atendente)
      if (sessao) {
        await upsertSessao(telefone, { humano_ativo: true, estado: 'humano' })
      }
      return res.status(200).json({ ok: true, handled: 'outgoing' })
    }

    // ─── MENSAGEM RECEBIDA (incoming) ───
    const texto = extrairTextoMensagem(data.message)
    if (!texto) return res.status(200).json({ ok: true, skip: 'no text' })

    // Buscar ou criar sessão
    let sessao = await buscarSessao(telefone)
    const config = await buscarConfig()

    // Checar modo do bot: 'ligado' | 'desligado' | 'auto'
    // desligado → silêncio total
    // auto      → responde 24h, mas avisa "fechado" fora do horário
    // ligado    → responde 24h, ignora horário (fluxo normal sempre)
    const modoBot = config.bot_ativo || 'auto'
    if (modoBot === 'desligado') {
      return res.status(200).json({ ok: true, skip: 'bot_desligado' })
    }

    // Checar timeout da sessão — resetar se antiga
    if (sessao && sessao.updated_at) {
      const diff = Date.now() - new Date(sessao.updated_at).getTime()
      if (diff > SESSION_TIMEOUT_MS) {
        sessao = await upsertSessao(telefone, {
          estado: 'novo',
          humano_ativo: false,
          nome_contato: nomeContato,
          bot_msg_ids: [],
        })
      }
    }

    if (!sessao) {
      sessao = await upsertSessao(telefone, {
        estado: 'novo',
        humano_ativo: false,
        nome_contato: nomeContato,
        bot_msg_ids: [],
      })
    }

    // Se humano assumiu, bot não responde
    if (sessao.humano_ativo) {
      return res.status(200).json({ ok: true, skip: 'humano_ativo' })
    }

    // ─── CHECAR SE ESTÁ FORA DO HORÁRIO ───
    // Em modo 'ligado' ignora horário e vai direto pro fluxo de conversa
    const aberto = modoBot === 'ligado' ? true : estaAberto(config)
    if (!aberto) {
      const horario = `${config.horario_abertura || '10:00'} às ${config.horario_fechamento || '22:00'}`

      if (sessao.estado !== 'fora_horario') {
        // Primeira msg fora do horário (qualquer estado)
        await enviarBot(telefone,
          `Olá${nomeContato ? `, ${nomeContato}` : ''}! 👋\n\n` +
          `Obrigado por entrar em contato com o *Pastel do Carioca*! 🥟\n\n` +
          `⏰ No momento estamos *fechados*.\n\n` +
          `🕐 Nosso horário de funcionamento: *${horario}*\n\n` +
          `Enquanto isso, confira nosso cardápio:\n` +
          `👉 ${LINK_CARDAPIO}\n\n` +
          `Volte no nosso horário de atendimento! 😊`
        )
        await upsertSessao(telefone, { estado: 'fora_horario', nome_contato: nomeContato })
      } else {
        // Repetiu msg ainda fechado
        await enviarBot(telefone,
          `Ainda estamos fechados! ⏰\n\n` +
          `🕐 Nosso horário: *${horario}*\n\n` +
          `Mas você já pode ver o cardápio:\n` +
          `👉 ${LINK_CARDAPIO}\n\n` +
          `Assim que abrirmos, estaremos prontos pra te atender! 🥟`
        )
      }
      return res.status(200).json({ ok: true, action: 'fora_horario' })
    }

    // ─── CHECAR PEDIDO DE PIX ───
    const textoLower = texto.toLowerCase()
    if (textoLower.includes('pix') || textoLower.includes('chave') || textoLower.includes('codigo') || textoLower.includes('copia')) {
      const pedidoAtivo = await buscarPedidoAtivo(telefone)
      if (pedidoAtivo && pedidoAtivo.pagamento === 'pix') {
        const pixChave = config.pix_chave || ''
        const pixNome = config.pix_nome || 'PASTEL DO CARIOCA'
        const pixCidade = (config.endereco_loja || 'Visconde do Rio Branco').split('-')[0].trim()
        const valorPedido = Number(pedidoAtivo.total) || 0

        let msgPix = `💰 *PIX do Pedido #${pedidoAtivo.numero}*\n\n`
        msgPix += `Valor: *R$ ${valorPedido.toFixed(2).replace('.', ',')}*\n\n`
        msgPix += `Chave PIX: *${pixChave}*\n`
        msgPix += `Nome: ${pixNome}\n\n`

        if (pixChave && valorPedido > 0) {
          const copiaCola = gerarPixCopiaCola({
            chave: pixChave,
            nome: pixNome,
            cidade: pixCidade,
            valor: valorPedido,
            txid: `PED${pedidoAtivo.numero}`,
          })
          msgPix += `📋 *Copia e Cola:*\n${copiaCola}\n\n`
        }
        msgPix += `Após o pagamento, envie o comprovante aqui! 🧾`

        await enviarBot(telefone, msgPix)
        return res.status(200).json({ ok: true, action: 'pix_enviado' })
      }
    }

    // ─── FLUXO DE CONVERSA ───
    switch (sessao.estado) {
      case 'novo': {
        // 1. Primeira mensagem → saudação + link
        await enviarBot(telefone,
          `Olá${nomeContato ? `, ${nomeContato}` : ''}! 👋\n\n` +
          `Bem-vindo ao *Pastel do Carioca*! 🥟\n\n` +
          `Acesse nosso cardápio digital e faça seu pedido:\n` +
          `👉 ${LINK_CARDAPIO}\n\n` +
          `É rápido e fácil! Escolha seus pastéis favoritos e finalize pelo site. 😋`
        )
        await upsertSessao(telefone, { estado: 'saudacao', nome_contato: nomeContato })
        return res.status(200).json({ ok: true, action: 'saudacao' })
      }

      case 'saudacao':
      case 'fora_horario': {
        // 2. Segunda mensagem → link novamente + pergunta dúvida
        await enviarBot(telefone,
          `Nosso cardápio digital está aqui:\n` +
          `👉 ${LINK_CARDAPIO}\n\n` +
          `Faça seu pedido pelo site que é rapidinho! 🥟\n\n` +
          `Tem alguma *dúvida*? Posso te direcionar para um atendente! 😊`
        )
        await upsertSessao(telefone, { estado: 'perguntou_duvida' })
        return res.status(200).json({ ok: true, action: 'cardapio_duvida' })
      }

      case 'perguntou_duvida': {
        // 3. Terceira mensagem → direciona para humano
        await enviarBot(telefone,
          `Vou te direcionar para um atendente! 🙋‍♂️\n\n` +
          `Aguarde um momento que já vamos te atender.\n` +
          `Obrigado pela paciência! 🙏`
        )
        await upsertSessao(telefone, { estado: 'humano', humano_ativo: true })
        return res.status(200).json({ ok: true, action: 'direcionado_humano' })
      }

      case 'humano': {
        // Já está com humano — não responde
        return res.status(200).json({ ok: true, skip: 'humano' })
      }

      default: {
        // Estado desconhecido — resetar
        await upsertSessao(telefone, { estado: 'novo', humano_ativo: false, bot_msg_ids: [] })
        return res.status(200).json({ ok: true, action: 'reset' })
      }
    }
  } catch (err) {
    console.error('[WhatsApp Webhook]', err)
    console.error('[WhatsApp Webhook]', err.message)
    return res.status(200).json({ ok: false, error: 'Erro interno.' })
  }
}
