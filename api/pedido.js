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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method === 'OPTIONS') return res.status(200).end()

  /* ── GET ── */
  if (req.method === 'GET') {
    const { telefone, data, id } = req.query

    if (id) {
      const { data: pedido, error } = await supabase
        .from('orders').select('*').eq('id', id).single()
      if (error) return res.status(404).json({ error: error.message })
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
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(pedidos)
    }

    let query = supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (data) {
      const tz = parseInt(req.query.tz || '0', 10)
      const offsetH = String(Math.abs(tz)).padStart(2, '0')
      const sign = tz <= 0 ? '-' : '+'
      const tzStr = `${sign}${offsetH}:00`
      query = query.gte('created_at', `${data}T00:00:00${tzStr}`).lte('created_at', `${data}T23:59:59${tzStr}`)
    }
    const { data: pedidos, error } = await query
    if (error) return res.status(500).json({ error: error.message })
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

    const { data: pedido, error } = await supabase
      .from('orders')
      .insert(insertData)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(pedido)
  }

  /* ── PATCH ── */
  if (req.method === 'PATCH') {
    const { id, status, itens, total, subtotal, pagamento, nome, observacao } = req.body
    if (!id) return res.status(400).json({ error: 'id obrigatório.' })

    const updates = { updated_at: new Date().toISOString() }
    if (status) {
      const VALIDOS = ['recebido', 'preparando', 'pronto', 'entregue']
      if (!VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' })
      updates.status = status
    }
    if (itens !== undefined) updates.itens = typeof itens === 'string' ? itens : JSON.stringify(itens)
    if (total !== undefined) updates.total = Number(total) || 0
    if (subtotal !== undefined) updates.subtotal = Number(subtotal) || 0
    if (pagamento !== undefined) updates.pagamento = pagamento
    if (nome !== undefined) updates.nome = nome
    if (observacao !== undefined) updates.observacao = observacao

    const { data: pedido, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(pedido)
  }

  /* ── DELETE ── */
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id obrigatório.' })
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
