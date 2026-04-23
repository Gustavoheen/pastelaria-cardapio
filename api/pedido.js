const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)

const RATE_LIMIT_MAP = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 5

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = RATE_LIMIT_MAP.get(ip) || { count: 0, start: now }
  if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
    RATE_LIMIT_MAP.set(ip, { count: 1, start: now })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  RATE_LIMIT_MAP.set(ip, { count: entry.count + 1, start: entry.start })
  return true
}

async function gerarNumeroSequencial() {
  // Busca todos os números que são sequenciais puros (sem traço)
  const { data: existentes } = await supabase
    .from('orders')
    .select('numero')
    .not('numero', 'like', '%-%')
    .order('created_at', { ascending: false })
    .limit(1)

  let seq = 1
  if (existentes && existentes.length > 0) {
    const ultimo = parseInt(existentes[0].numero, 10)
    if (!isNaN(ultimo)) seq = ultimo + 1
  }

  return String(seq)
}

const { checkAdminAuth, setCorsHeaders } = require('./_lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method === 'OPTIONS') return res.status(200).end()

  /* ── GET ── */
  if (req.method === 'GET') {
    const { telefone, data, id, dataInicio, dataFim } = req.query

    if (id) {
      const { data: pedido, error } = await supabase
        .from('orders').select('*').eq('id', id).single()
      if (error) { console.error('[pedido GET id]', error.message); return res.status(404).json({ error: 'Pedido nao encontrado.' }) }
      return res.status(200).json(pedido)
    }

    if (telefone) {
      const tel = String(telefone).replace(/\D/g, '')
      const { data: pedidos, error } = await supabase
        .from('orders')
        .select('*')
        .ilike('telefone', `%${tel}%`)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) { console.error('[pedido GET tel]', error.message); return res.status(500).json({ error: 'Erro ao buscar pedidos.' }) }
      return res.status(200).json(pedidos)
    }

    let query = supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (data || (dataInicio && dataFim)) {
      const tz = parseInt(req.query.tz || '0', 10)
      const offsetH = String(Math.abs(tz)).padStart(2, '0')
      const sign = tz <= 0 ? '-' : '+'
      const tzStr = `${sign}${offsetH}:00`
      if (data) {
        query = query.gte('created_at', `${data}T00:00:00${tzStr}`).lte('created_at', `${data}T23:59:59${tzStr}`)
      } else {
        query = query.gte('created_at', `${dataInicio}T00:00:00${tzStr}`).lte('created_at', `${dataFim}T23:59:59${tzStr}`)
      }
    }
    const { data: pedidos, error } = await query
    if (error) { console.error('[pedido GET list]', error.message); return res.status(500).json({ error: 'Erro ao buscar pedidos.' }) }
    return res.status(200).json(pedidos)
  }

  /* ── POST ── */
  if (req.method === 'POST') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown'
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' })
    }

    const body = req.body
    if (typeof body !== 'object') return res.status(400).json({ error: 'Body inválido.' })
    if (body.honeypot && body.honeypot !== '') return res.status(200).json({ numero: 'BOT', id: null })

    // ── Verificar se loja está aberta (apenas pedidos externos) ──
    if (body.origem !== 'balcao') {
      try {
        const { data: state } = await supabase
          .from('store_state').select('status,horario_abertura,horario_fechamento,dias_funcionamento')
          .eq('id', 1).maybeSingle()

        if (state) {
          let lojaAberta = false

          if (state.status === 'aberta') {
            lojaAberta = true
          } else if (state.status === 'fechada') {
            lojaAberta = false
          } else {
            // 'auto' — verifica horário e dia da semana (UTC-3)
            const agora = new Date()
            const offsetMs = -3 * 60 * 60 * 1000
            const local = new Date(agora.getTime() + offsetMs)
            const hh = local.getUTCHours()
            const mm = local.getUTCMinutes()
            const horaAtual = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
            const abre = state.horario_abertura || '00:00'
            const fecha = state.horario_fechamento || '23:59'
            const dentroHorario = horaAtual >= abre && horaAtual <= fecha
            const diasFuncionamento = Array.isArray(state.dias_funcionamento) ? state.dias_funcionamento : []
            const diaHoje = local.getUTCDay() // 0=dom … 6=sab
            const diaNaLista = diasFuncionamento.length === 0 || diasFuncionamento.includes(diaHoje)
            lojaAberta = dentroHorario && diaNaLista
          }

          if (!lojaAberta) {
            return res.status(503).json({ error: 'A loja está fechada no momento. Tente novamente durante o horário de funcionamento.' })
          }
        }
      } catch (_) { /* se falhar, deixa o pedido passar */ }
    }

    const { nome, telefone, pagamento, itens, subtotal, total } = body

    if (!nome || !telefone || !pagamento || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Dados obrigatórios ausentes.' })
    }

    let numero
    try { numero = await gerarNumeroSequencial() }
    catch (_) { numero = `${Date.now()}` }

    const agora = new Date()
    const tipoEntrega = body.tipo_entrega === 'entrega' ? 'entrega' : 'retirada'
    const taxaEntrega = tipoEntrega === 'entrega' ? (Number(body.taxa_entrega) || 0) : 0
    const totalFinal = Number(subtotal || 0) + taxaEntrega

    const insertData = {
      numero,
      nome: nome.trim(),
      telefone: String(telefone).replace(/\D/g, ''),
      tipo_entrega: tipoEntrega,
      pagamento,
      troco: body.troco || null,
      itens: JSON.stringify(itens),
      subtotal: Number(subtotal) || 0,
      taxa_entrega: taxaEntrega,
      total: Number(total || totalFinal) || 0,
      status: 'recebido',
      data: agora.toLocaleDateString('pt-BR'),
      hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      observacao: body.observacao || null,
      endereco: tipoEntrega === 'entrega' && body.endereco ? body.endereco : null,
    }
    if (body.origem) insertData.origem = body.origem
    if (body.desconto_tipo) {
      insertData.desconto_tipo = body.desconto_tipo
      insertData.desconto_valor = Number(body.desconto_valor) || 0
      insertData.desconto_pct = body.desconto_pct ? Number(body.desconto_pct) : null
      insertData.desconto_obs = body.desconto_obs || null
    }

    const { data: pedido, error } = await supabase
      .from('orders')
      .insert(insertData)
      .select()
      .single()

    if (error) { console.error('[pedido POST]', error.message); return res.status(500).json({ error: 'Erro ao criar pedido.' }) }
    return res.status(201).json(pedido)
  }

  /* ── PATCH ── */
  if (req.method === 'PATCH') {
    if (!checkAdminAuth(req, res)) return
    const { id, status, itens, total, subtotal, pagamento, nome, observacao } = req.body
    if (!id) return res.status(400).json({ error: 'id obrigatório.' })

    const updates = { updated_at: new Date().toISOString() }
    if (status) {
      const VALIDOS = ['recebido', 'preparando', 'pronto', 'entregue']
      if (!VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' })

      // Proteger pedidos do balcão: não pular direto para entregue/preparando após criação
      // O frontend antigo (cacheado) faz PATCH para entregue logo após POST — ignorar isso
      if ((status === 'entregue' || status === 'preparando') && !req.body.force_status) {
        const { data: pedidoAtual } = await supabase.from('orders').select('status,origem,created_at').eq('id', id).single()
        if (pedidoAtual?.origem === 'balcao' && pedidoAtual?.status === 'recebido') {
          const idadeMs = Date.now() - new Date(pedidoAtual.created_at).getTime()
          if (idadeMs < 10000) {
            // Pedido acabou de ser criado — manter como recebido (ignorar auto-close do frontend cacheado)
            return res.status(200).json(pedidoAtual)
          }
        }
      }

      updates.status = status
    }
    if (itens !== undefined) updates.itens = typeof itens === 'string' ? itens : JSON.stringify(itens)
    if (total !== undefined) updates.total = Number(total) || 0
    if (subtotal !== undefined) updates.subtotal = Number(subtotal) || 0
    if (pagamento !== undefined) updates.pagamento = pagamento
    if (req.body.troco !== undefined) updates.troco = req.body.troco
    if (nome !== undefined) updates.nome = nome
    if (observacao !== undefined) updates.observacao = observacao
    if (req.body.desconto_tipo !== undefined) {
      updates.desconto_tipo = req.body.desconto_tipo
      updates.desconto_valor = Number(req.body.desconto_valor) || 0
      updates.desconto_pct = req.body.desconto_pct ? Number(req.body.desconto_pct) : null
      updates.desconto_obs = req.body.desconto_obs || null
    }

    const { data: pedido, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) { console.error('[pedido PATCH]', error.message); return res.status(500).json({ error: 'Erro ao atualizar pedido.' }) }
    return res.status(200).json(pedido)
  }

  /* ── DELETE ── */
  if (req.method === 'DELETE') {
    if (!checkAdminAuth(req, res)) return
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id obrigatório.' })
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) { console.error('[pedido DELETE]', error.message); return res.status(500).json({ error: 'Erro ao excluir pedido.' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
