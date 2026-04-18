const { createClient } = require('@supabase/supabase-js')
const { setCorsHeaders } = require('./_lib/auth')

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { db: { schema: 'pastel' } }
  )
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { senha } = req.body || {}
  if (!senha) return res.status(400).json({ erro: 'Senha obrigatória.' })

  // 1. Senha via variável de ambiente ou fallback padrão
  const envPassword = process.env.ADMIN_PASSWORD || 'carioca2025'
  if (senha === envPassword) {
    return res.status(200).json({ ok: true, token: process.env.ADMIN_API_KEY || 'carioca-admin' })
  }

  // 2. Senha via banco (store_state.senha_admin)
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('store_state')
      .select('senha_admin')
      .eq('id', 1)
      .maybeSingle()

    const senhaAdmin = data?.senha_admin
    if (senhaAdmin && senha === senhaAdmin) {
      return res.status(200).json({ ok: true, token: process.env.ADMIN_API_KEY || 'carioca-admin' })
    }
  } catch (err) {
    console.error('[admin-login] DB error:', err)
  }

  return res.status(401).json({ erro: 'Senha incorreta.' })
}
