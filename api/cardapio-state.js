const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  /* ── GET ── */
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('store_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(200).json(null)
    return res.status(200).json(data)
  }

  /* ── POST (upsert) ── */
  if (req.method === 'POST') {
    const body = req.body
    if (typeof body !== 'object') return res.status(400).json({ error: 'Body inválido.' })

    const STATUS_VALIDOS = ['auto', 'aberta', 'fechada']
    if (body.status && !STATUS_VALIDOS.includes(body.status)) {
      return res.status(400).json({ error: 'Status inválido.' })
    }
    const BOT_VALIDOS = ['ligado', 'desligado', 'auto']
    if (body.bot_ativo && !BOT_VALIDOS.includes(body.bot_ativo)) {
      return res.status(400).json({ error: 'Modo do bot inválido.' })
    }

    const payload = { id: 1, updated_at: new Date().toISOString() }

    const campos = [
      'status', 'horario_abertura', 'horario_fechamento', 'whatsapp',
      'desativados', 'precos',
      'especial_ativo', 'especial_nome', 'especial_descricao', 'especial_preco',
      'pix_chave', 'pix_tipo', 'pix_nome', 'endereco_loja', 'combos',
      'dias_funcionamento', 'taxa_entrega', 'entrega_ativa', 'bot_ativo',
      'senha_desconto',
    ]
    campos.forEach(c => { if (body[c] !== undefined) payload[c] = body[c] })

    if (payload.especial_preco !== undefined) payload.especial_preco = Number(payload.especial_preco)

    const { data, error } = await supabase
      .from('store_state')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
