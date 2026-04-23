const { createClient } = require('@supabase/supabase-js')
const { checkAdminAuth, setCorsHeaders } = require('./_lib/auth')
const { formatarNome, chaveNome } = require('./_lib/nome')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)

function isFakePhone(t) {
  return !t || t.startsWith('x') || t === '00000000000'
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!checkAdminAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido.' })

  try {
    // 1. Buscar todos os clientes
    const { data: clientes, error: errCli } = await supabase
      .from('customers')
      .select('*')
    if (errCli) throw errCli

    if (!clientes || clientes.length === 0) {
      return res.status(200).json({ grupos: 0, duplicatasRemovidas: 0, nomesAtualizados: 0 })
    }

    // 2. Agrupar por chaveNome
    const grupos = {}
    clientes.forEach(c => {
      const chave = chaveNome(c.nome)
      if (!chave) return
      if (!grupos[chave]) grupos[chave] = []
      grupos[chave].push(c)
    })

    let gruposUnificados = 0
    let duplicatasRemovidas = 0
    let nomesAtualizados = 0

    for (const [chave, lista] of Object.entries(grupos)) {
      const nomeFormatado = formatarNome(lista[0].nome)

      // Caso 1: apenas 1 cliente mas nome precisa ser reformatado
      if (lista.length === 1) {
        const c = lista[0]
        if (c.nome !== nomeFormatado) {
          await supabase.from('customers').update({
            nome: nomeFormatado,
            updated_at: new Date().toISOString(),
          }).eq('id', c.id)
          nomesAtualizados++
        }
        continue
      }

      // Caso 2: duplicatas — escolher master (o mais antigo)
      lista.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      const master = lista[0]
      const duplicados = lista.slice(1)

      // Mesclar enderecos (sem duplicar)
      let enderecos = [...(master.enderecos || [])]
      duplicados.forEach(d => {
        ;(d.enderecos || []).forEach(e => {
          const existe = enderecos.some(ex =>
            ex.rua === e.rua && ex.numero === e.numero && ex.bairro === e.bairro
          )
          if (!existe && e.rua) enderecos.push(e)
        })
      })
      enderecos = enderecos.slice(0, 10)

      // Somar total_pedidos de todos
      const totalPedidos = lista.reduce((s, c) => s + (c.total_pedidos || 0), 0)

      // CPF: pegar o primeiro que tiver
      const cpf = lista.find(c => c.cpf)?.cpf || master.cpf || null

      // Telefone: preferir um real em vez de placeholder
      const telReal = lista.find(c => !isFakePhone(c.telefone))?.telefone
      const telefone = telReal || master.telefone

      // Limite de credito: pegar o maior definido
      const limites = lista.map(c => c.limite_credito).filter(v => v != null).map(Number)
      const limite_credito = limites.length > 0 ? Math.max(...limites) : null

      // Atualizar master com dados consolidados
      await supabase.from('customers').update({
        nome: nomeFormatado,
        telefone,
        cpf,
        enderecos,
        total_pedidos: totalPedidos,
        limite_credito,
        updated_at: new Date().toISOString(),
      }).eq('id', master.id)

      // Mover caderneta dos duplicados para o master e deletar duplicados
      for (const dup of duplicados) {
        // Move entradas de caderneta
        await supabase.from('caderneta')
          .update({ cliente_id: master.id })
          .eq('cliente_id', dup.id)

        // Deletar cliente duplicado
        const { error: errDel } = await supabase.from('customers').delete().eq('id', dup.id)
        if (!errDel) duplicatasRemovidas++
      }

      gruposUnificados++
      nomesAtualizados++
    }

    return res.status(200).json({
      grupos: gruposUnificados,
      duplicatasRemovidas,
      nomesAtualizados,
      totalClientes: clientes.length,
    })
  } catch (err) {
    console.error('[merge-clientes]', err.message)
    return res.status(500).json({ error: 'Erro interno ao unificar.' })
  }
}
