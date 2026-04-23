const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)

const { checkAdminAuth, setCorsHeaders } = require('./_lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  /* ── GET ── */
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('estoque')
      .select('*')
      .eq('ativo', true)
      .order('nome', { ascending: true })
    if (error) { console.error('[estoque]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json(data)
  }

  /* ── POST ── */
  if (req.method === 'POST') {
    if (!checkAdminAuth(req, res)) return
    const { nome, categoria, quantidade, unidade, preco_custo, alerta_minimo, produto_id } = req.body
    if (!nome) return res.status(400).json({ error: 'nome obrigatório.' })

    const { data, error } = await supabase
      .from('estoque')
      .insert({
        nome: nome.trim(),
        categoria: categoria || 'geral',
        quantidade: Number(quantidade) || 0,
        unidade: unidade || 'un',
        preco_custo: preco_custo ? Number(preco_custo) : null,
        alerta_minimo: Number(alerta_minimo) || 5,
        produto_id: produto_id || null,
        ativo: true,
      })
      .select()
      .single()
    if (error) { console.error('[estoque]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(201).json(data)
  }

  /* ── PATCH ── */
  if (req.method === 'PATCH') {
    if (!checkAdminAuth(req, res)) return
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id obrigatório.' })

    const payload = { updated_at: new Date().toISOString() }
    if (updates.quantidade !== undefined) payload.quantidade = Number(updates.quantidade)
    if (updates.nome !== undefined) payload.nome = updates.nome
    if (updates.categoria !== undefined) payload.categoria = updates.categoria
    if (updates.unidade !== undefined) payload.unidade = updates.unidade
    if (updates.preco_custo !== undefined) payload.preco_custo = updates.preco_custo !== null ? Number(updates.preco_custo) : null
    if (updates.alerta_minimo !== undefined) payload.alerta_minimo = Number(updates.alerta_minimo)
    if (updates.produto_id !== undefined) payload.produto_id = updates.produto_id
    if (updates.ativo !== undefined) payload.ativo = updates.ativo

    const { data, error } = await supabase
      .from('estoque')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error('[estoque]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json(data)
  }

  /* ── DELETE ── */
  if (req.method === 'DELETE') {
    if (!checkAdminAuth(req, res)) return
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id obrigatório.' })
    const { error } = await supabase.from('estoque').update({ ativo: false }).eq('id', id)
    if (error) { console.error('[estoque]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
