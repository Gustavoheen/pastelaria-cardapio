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

  // GET — retorna todas as sobrescritas de sabor
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('bebidas_sabores')
      .select('*')
    if (error) { console.error('[bebidas-sabores]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json(data)
  }

  // PATCH — upsert sabores de uma bebida
  // body: { bebida_id, sabores: ['Sabor1', 'Sabor2', ...] }
  if (req.method === 'PATCH') {
    if (!checkAdminAuth(req, res)) return
    const { bebida_id, sabores } = req.body
    if (!bebida_id || !Array.isArray(sabores))
      return res.status(400).json({ error: 'bebida_id e sabores[] obrigatórios' })

    const { data, error } = await supabase
      .from('bebidas_sabores')
      .upsert({ bebida_id, sabores }, { onConflict: 'bebida_id' })
      .select()
      .single()
    if (error) { console.error('[bebidas-sabores]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json(data)
  }

  return res.status(405).json({ error: 'Método não permitido' })
}
