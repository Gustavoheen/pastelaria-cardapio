/**
 * Envia confirmação de pedido via WhatsApp ao cliente.
 * Chamado pelo ModalPedido.jsx após salvar o pedido.
 *
 * POST body: { telefone, numeroPedido, nome, itens, total, pagamento }
 *
 * Se pagamento = pix → envia chave + copia e cola + pede comprovante
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
// public schema — carioca_whatsapp_sessions
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const { checkAdminAuth, setCorsHeaders } = require('../_lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!checkAdminAuth(req, res)) return

  try {
    const { telefone, numeroPedido, nome, itens, total, pagamento } = req.body
    if (!telefone || !numeroPedido) {
      return res.status(400).json({ error: 'telefone e numeroPedido obrigatórios' })
    }

    const telCompleto = '55' + String(telefone).replace(/\D/g, '').replace(/^55/, '')

    // Formatar itens
    const itensArr = Array.isArray(itens) ? itens : []
    const linhasItens = itensArr.map(i => {
      const qtd = i.qtd || i.quantidade || 1
      const nomeProd = i.nome || 'Item'
      return `  🥟 ${qtd}x ${nomeProd}`
    }).join('\n')

    const valorTotal = Number(total) || 0

    let mensagem =
      `✅ *Pedido #${numeroPedido} recebido!*\n\n` +
      `Olá, ${nome || 'cliente'}! Seu pedido foi registrado com sucesso.\n\n` +
      `📋 *Itens:*\n${linhasItens || '  (ver no site)'}\n\n` +
      `💰 *Total: R$ ${valorTotal.toFixed(2).replace('.', ',')}*\n` +
      `💳 *Pagamento:* ${(pagamento || '').toUpperCase()}\n`

    // Se PIX → enviar chave e copia e cola
    if (pagamento && pagamento.toLowerCase() === 'pix') {
      const { data: config } = await supabase
        .from('store_state')
        .select('pix_chave, pix_nome, pix_tipo, endereco_loja')
        .limit(1)
        .single()

      const pixChave = config?.pix_chave || ''
      const pixNome = config?.pix_nome || 'PASTEL DO CARIOCA'
      const pixCidade = (config?.endereco_loja || 'Visconde do Rio Branco').split('-')[0].trim()

      mensagem += `\n────────────────────\n`
      mensagem += `🏦 *Dados PIX:*\n`
      mensagem += `Chave: *${pixChave}*\n`
      mensagem += `Nome: ${pixNome}\n\n`

      if (pixChave && valorTotal > 0) {
        const copiaCola = gerarPixCopiaCola({
          chave: pixChave,
          nome: pixNome,
          cidade: pixCidade,
          valor: valorTotal,
          txid: `PED${numeroPedido}`,
        })
        mensagem += `📋 *PIX Copia e Cola:*\n${copiaCola}\n\n`
      }

      mensagem += `⚠️ *Envie o comprovante aqui para agilizar!* 🧾`
    }

    mensagem += `\n\nAcompanhe: avisaremos cada etapa do seu pedido! 🥟`

    await enviarTexto(telCompleto, mensagem)

    // Atualizar/criar sessão — marcar que tem pedido ativo
    const { data: pedido } = await supabase
      .from('carioca_orders')
      .select('id')
      .eq('numero', numeroPedido)
      .limit(1)
      .single()

    if (pedido) {
      await supabasePublic
        .from('carioca_whatsapp_sessions')
        .upsert(
          {
            telefone: telCompleto,
            nome_contato: nome || '',
            ultimo_pedido_id: pedido.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'telefone' }
        )
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[WhatsApp Confirmação]', err)
    console.error('[WhatsApp Confirmacao]', err.message); return res.status(500).json({ error: 'Erro ao enviar confirmacao.' })
  }
}
