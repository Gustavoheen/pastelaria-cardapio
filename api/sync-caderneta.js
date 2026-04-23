const { createClient } = require('@supabase/supabase-js')
const { checkAdminAuth, setCorsHeaders } = require('./_lib/auth')
const { formatarNome, chaveNome } = require('./_lib/nome')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)

function parseItens(raw) {
  if (!raw) return []
  try { return Array.isArray(raw) ? raw : JSON.parse(raw) } catch { return [] }
}

function toDataBR(isoStr) {
  if (!isoStr) return null
  // created_at pode ser UTC, ajusta para GMT-3
  const d = new Date(new Date(isoStr).getTime() - 3 * 60 * 60 * 1000)
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!checkAdminAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' })

  try {
    // 1. Buscar todos os pedidos com pagamento='caderneta'
    const { data: pedidos, error: errPed } = await supabase
      .from('orders')
      .select('*')
      .eq('pagamento', 'caderneta')
      .order('created_at', { ascending: true })
    if (errPed) throw errPed

    if (!pedidos || pedidos.length === 0) {
      return res.status(200).json({ importados: 0, pulados: 0, total: 0 })
    }

    // 2. Buscar todas as entradas existentes na caderneta
    const { data: entradasExistentes, error: errCad } = await supabase
      .from('caderneta')
      .select('cliente_id, valor, data')
    if (errCad) throw errCad
    const existSet = new Set(
      (entradasExistentes || []).map(e => `${e.cliente_id}|${Number(e.valor).toFixed(2)}|${e.data}`)
    )

    // 3. Buscar todos os clientes para cache de nome->id (usa chave normalizada sem acentos)
    const { data: clientes } = await supabase
      .from('customers')
      .select('id, nome, telefone')
    const clienteCache = {}
    ;(clientes || []).forEach(c => {
      clienteCache[chaveNome(c.nome)] = c
    })

    let importados = 0
    let pulados = 0

    for (const pedido of pedidos) {
      const nomeRaw = (pedido.nome || '').trim()
      if (!nomeRaw) { pulados++; continue }

      const dataBR = toDataBR(pedido.created_at)
      const valor = Number(pedido.total || pedido.subtotal || 0)
      if (valor <= 0) { pulados++; continue }

      // Encontrar ou criar cliente pelo nome normalizado (ignora acentos/caixa)
      const nomeFormatado = formatarNome(nomeRaw)
      const chave = chaveNome(nomeFormatado)
      let cliente = clienteCache[chave]
      if (!cliente) {
        // Criar cliente novo com nome bem formatado
        const telFinal = 'xsync_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
        const { data: novo } = await supabase
          .from('customers')
          .insert({ nome: nomeFormatado, telefone: telFinal, total_pedidos: 0, enderecos: [] })
          .select()
          .single()
        if (novo) {
          cliente = novo
          clienteCache[chave] = novo
        }
      }
      if (!cliente) { pulados++; continue }

      // Verificar se já existe entrada igual (mesmo cliente + mesmo valor + mesma data)
      const chave = `${cliente.id}|${valor.toFixed(2)}|${dataBR}`
      if (existSet.has(chave)) { pulados++; continue }

      // Montar descrição a partir dos itens
      const itens = parseItens(pedido.itens)
      const descricao = itens.length > 0
        ? itens.map(i => `${i.qtd || i.quantidade || 1}x ${i.nome}`).join(', ')
        : (pedido.observacao || 'Pedido fiado')

      // Criar entrada na caderneta
      const { error: errIns } = await supabase
        .from('caderneta')
        .insert({
          cliente_id: cliente.id,
          descricao,
          itens: itens,
          valor,
          data: dataBR,
          pago: false,
        })

      if (!errIns) {
        existSet.add(chave) // evita duplicata dentro do mesmo loop
        importados++
      } else {
        console.error('[sync-caderneta] erro ao inserir:', errIns.message, { pedido: pedido.id })
        pulados++
      }
    }

    return res.status(200).json({ importados, pulados, total: pedidos.length })
  } catch (err) {
    console.error('[sync-caderneta]', err.message)
    return res.status(500).json({ error: 'Erro interno ao sincronizar.' })
  }
}
