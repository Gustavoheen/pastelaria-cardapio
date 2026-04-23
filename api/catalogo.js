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

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('catalogo')
      .select('*')
      .eq('ativo', true)
      .order('created_at', { ascending: true })
    if (error) { console.error('[catalogo GET]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    if (!checkAdminAuth(req, res)) return
    const { nome, preco } = req.body
    if (!nome || !preco) return res.status(400).json({ error: 'nome e preco obrigatórios' })
    const { data, error } = await supabase
      .from('catalogo')
      .insert({ nome: nome.trim(), preco: parseFloat(preco) })
      .select()
      .single()
    if (error) { console.error('[catalogo POST]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    if (!checkAdminAuth(req, res)) return
    const { id } = req.query
    const { nome, preco } = req.body
    if (!id) return res.status(400).json({ error: 'id obrigatório' })
    const updates = {}
    if (nome !== undefined) updates.nome = nome.trim()
    if (preco !== undefined) updates.preco = parseFloat(preco)
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'nada para atualizar' })
    const { data, error } = await supabase
      .from('catalogo')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) { console.error('[catalogo PATCH]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    if (!checkAdminAuth(req, res)) return
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id obrigatório' })
    const { error } = await supabase
      .from('catalogo')
      .update({ ativo: false })
      .eq('id', id)
    if (error) { console.error('[catalogo DELETE]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Método não permitido' })
}
