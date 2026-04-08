const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  /* ── GET ── lista entradas com dados do cliente */
  if (req.method === 'GET') {
    const { cliente_id } = req.query

    let query = supabase
      .from('caderneta')
      .select(`
        *,
        customers!caderneta_cliente_id_fkey (
          nome,
          cpf,
          telefone
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (cliente_id) query = query.eq('cliente_id', cliente_id)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    // Achata os campos do cliente para manter interface plana
    const resultado = (data || []).map(({ customers: cliente, ...entrada }) => ({
      ...entrada,
      nome: cliente?.nome ?? null,
      cpf: cliente?.cpf ?? null,
      telefone: cliente?.telefone ?? null,
    }))

    return res.status(200).json(resultado)
  }

  /* ── POST ── insere nova entrada na caderneta */
  if (req.method === 'POST') {
    const { cliente_id, descricao, itens, valor, data, vencimento } = req.body

    if (!cliente_id) return res.status(400).json({ error: 'cliente_id é obrigatório.' })
    if (valor === undefined || valor === null) return res.status(400).json({ error: 'valor é obrigatório.' })

    const nova = {
      cliente_id,
      descricao: descricao || '',
      itens: itens || [],
      valor: Number(valor),
      data: data || null,
      vencimento: vencimento || null,
    }

    const { data: inserted, error } = await supabase
      .from('caderneta')
      .insert(nova)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(inserted)
  }

  /* ── PATCH ?id=X ── atualiza pago */
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id é obrigatório.' })

    const { pago, vencimento } = req.body
    if (pago === undefined && vencimento === undefined) return res.status(400).json({ error: 'pago ou vencimento é obrigatório.' })

    const updates = { updated_at: new Date().toISOString() }
    if (pago !== undefined) updates.pago = Boolean(pago)
    if (vencimento !== undefined) updates.vencimento = vencimento || null

    const { data, error } = await supabase
      .from('caderneta')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  /* ── DELETE ?id=X ── remove entrada */
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id é obrigatório.' })

    const { error } = await supabase
      .from('caderneta')
      .delete()
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
