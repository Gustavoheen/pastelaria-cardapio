const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)

const { checkAdminAuth, setCorsHeaders } = require('./_lib/auth')
const { formatarNome, chaveNome } = require('./_lib/nome')

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
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
        .limit(5000)
      if (error) { console.error('[clientes]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
      return res.status(200).json(data)
    }

    const tel = String(telefone).replace(/\D/g, '')
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('telefone', tel)
      .maybeSingle()
    if (error) { console.error('[clientes]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json(data) // null se não encontrou
  }

  /* ── POST ── cria ou atualiza cliente */
  if (req.method === 'POST') {
    const { telefone, nome, endereco, cpf, manual } = req.body
    const tel = String(telefone || '').replace(/\D/g, '')
    if (!nome) return res.status(400).json({ error: 'nome é obrigatório.' })
    if (!manual && !tel) return res.status(400).json({ error: 'telefone é obrigatório.' })
    // Criação manual sem telefone: gera placeholder único
    const telFinal = tel || ('x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5))

    const cpfNormalizado = cpf ? String(cpf).trim() || null : null
    const nomeFormatado = formatarNome(nome)
    const chave = chaveNome(nomeFormatado)

    // busca existente por telefone (se tiver) ou por nome normalizado sem acentos (clientes manuais sem telefone)
    let existente = null
    if (tel) {
      const { data } = await supabase.from('customers').select('*').eq('telefone', tel).maybeSingle()
      existente = data
    } else if (manual) {
      // Busca case/acento-insensitive: carrega candidatos e filtra por chaveNome
      const { data: candidatos } = await supabase.from('customers').select('*')
      existente = (candidatos || []).find(c => chaveNome(c.nome) === chave) || null
    }

    if (existente) {
      // Se achou por nome, retorna sem alterar (evita sobrescrever dados do cliente)
      if (!tel && manual) return res.status(200).json(existente)

      const updates = {
        nome: nomeFormatado,
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
      if (error) { console.error('[clientes]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
      return res.status(200).json(data)
    }

    // novo cliente
    const novo = {
      telefone: telFinal,
      nome: nomeFormatado,
      total_pedidos: manual ? 0 : 1,
      enderecos: endereco && endereco.rua ? [endereco] : [],
    }
    if (cpfNormalizado !== null) novo.cpf = cpfNormalizado

    const { data, error } = await supabase
      .from('customers')
      .insert(novo)
      .select()
      .single()
    if (error) { console.error('[clientes]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(201).json(data)
  }

  /* ── PATCH ?id=X ── atualiza limite_credito (ou outros campos admin) */
  if (req.method === 'PATCH') {
    if (!checkAdminAuth(req, res)) return
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
    if (error) { console.error('[clientes]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(200).json(data)
  }

  /* ── DELETE ?id=X ── remove cliente */
  if (req.method === 'DELETE') {
    if (!checkAdminAuth(req, res)) return
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id é obrigatório.' })
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) { console.error('[clientes]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
