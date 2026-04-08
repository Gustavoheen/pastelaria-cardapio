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

  /* ── GET ?telefone=XX ── busca cliente por telefone */
  if (req.method === 'GET') {
    const { telefone } = req.query
    if (!telefone) {
      // lista todos (admin)
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data)
    }

    const tel = String(telefone).replace(/\D/g, '')
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('telefone', tel)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data) // null se não encontrou
  }

  /* ── POST ── cria ou atualiza cliente */
  if (req.method === 'POST') {
    const { telefone, nome, endereco, cpf, manual } = req.body
    const tel = String(telefone || '').replace(/\D/g, '')
    if (!tel || !nome) return res.status(400).json({ error: 'telefone e nome obrigatórios.' })

    const cpfNormalizado = cpf ? String(cpf).trim() || null : null

    // busca existente
    const { data: existente } = await supabase
      .from('customers')
      .select('*')
      .eq('telefone', tel)
      .maybeSingle()

    if (existente) {
      const updates = {
        nome: nome.trim(),
        updated_at: new Date().toISOString(),
      }

      // só incrementa total_pedidos quando não for cadastro manual
      if (!manual) {
        updates.total_pedidos = (existente.total_pedidos || 0) + 1
      }

      // atualiza CPF se veio no body
      if (cpfNormalizado !== null) {
        updates.cpf = cpfNormalizado
      }

      // adiciona endereço se veio (máx 5, sem duplicar)
      if (endereco && endereco.rua) {
        const enderecos = existente.enderecos || []
        const jaExiste = enderecos.findIndex(e =>
          e.rua === endereco.rua && e.numero === endereco.numero && e.bairro === endereco.bairro
        )
        if (jaExiste >= 0) enderecos.splice(jaExiste, 1)
        enderecos.unshift(endereco)
        updates.enderecos = enderecos.slice(0, 5)
      }

      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', existente.id)
        .select()
        .single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data)
    }

    // novo cliente
    const novo = {
      telefone: tel,
      nome: nome.trim(),
      total_pedidos: manual ? 0 : 1,
      enderecos: endereco && endereco.rua ? [endereco] : [],
    }
    if (cpfNormalizado !== null) novo.cpf = cpfNormalizado

    const { data, error } = await supabase
      .from('customers')
      .insert(novo)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  /* ── PATCH ?id=X ── atualiza limite_credito (ou outros campos admin) */
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id é obrigatório.' })

    const { limite_credito } = req.body
    const updates = { updated_at: new Date().toISOString() }
    if (limite_credito !== undefined) updates.limite_credito = limite_credito === null || limite_credito === '' ? null : Number(limite_credito)

    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  /* ── DELETE ?id=X ── remove cliente */
  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id é obrigatório.' })
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
