/**
 * Notifica cliente via WhatsApp sobre mudança de status do pedido.
 * Chamado pelo Admin ao mudar status do pedido.
 *
 * POST body: { pedidoId, novoStatus }
 *
 * Status → mensagem:
 *   preparando → "Seu pedido está sendo preparado!"
 *   pronto     → "Seu pedido ficou pronto! Retire em [endereço]"
 *   entregue   → "Obrigado! Volte sempre!"
 */

const { createClient } = require('@supabase/supabase-js')
const { enviarTexto } = require('../_lib/evolution')

// pastel schema — carioca_orders, store_state
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: 'pastel' } }
)
// public schema — carioca_whatsapp_sessions
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { pedidoId, novoStatus } = req.body
    if (!pedidoId || !novoStatus) {
      return res.status(400).json({ error: 'pedidoId e novoStatus obrigatórios' })
    }

    // Buscar pedido
    const { data: pedido, error } = await supabase
      .from('carioca_orders')
      .select('*')
      .eq('id', pedidoId)
      .single()

    if (error || !pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' })
    }

    // Ignorar pedidos balcão (não tem telefone do cliente)
    if (pedido.origem === 'balcao') {
      return res.status(200).json({ ok: true, skip: 'balcao' })
    }

    const telefone = '55' + String(pedido.telefone).replace(/\D/g, '').replace(/^55/, '')

    // Buscar config da loja
    const { data: config } = await supabase
      .from('store_state')
      .select('*')
      .limit(1)
      .single()

    const endereco = config?.endereco_loja || ''
    const nomeLoja = 'Pastel do Carioca'

    let mensagem = ''

    switch (novoStatus) {
      case 'preparando':
        mensagem =
          `🔥 *Pedido #${pedido.numero} em produção!*\n\n` +
          `${pedido.nome}, seu pedido está sendo preparado com carinho! 🥟\n\n` +
          `Avisaremos quando ficar pronto. Aguarde! ⏳`
        break

      case 'pronto':
        mensagem =
          `✅ *Pedido #${pedido.numero} ficou pronto!*\n\n` +
          `${pedido.nome}, seu pedido está pronto para retirada! 🎉\n\n` +
          (endereco
            ? `📍 *Retire em:*\n${endereco}\n\n`
            : '') +
          `Estamos te esperando! 😊`
        break

      case 'entregue':
        mensagem =
          `🎉 *Pedido #${pedido.numero} finalizado!*\n\n` +
          `Obrigado pela preferência, ${pedido.nome}! 🥟\n\n` +
          `Esperamos que tenha gostado. Volte sempre ao *${nomeLoja}*! ❤️`
        break

      default:
        return res.status(200).json({ ok: true, skip: 'status_sem_msg' })
    }

    await enviarTexto(telefone, mensagem)

    // Atualizar sessão para não interferir com bot
    await supabasePublic
      .from('carioca_whatsapp_sessions')
      .upsert(
        { telefone, updated_at: new Date().toISOString() },
        { onConflict: 'telefone' }
      )

    return res.status(200).json({ ok: true, status: novoStatus })
  } catch (err) {
    console.error('[WhatsApp Notificar]', err)
    return res.status(500).json({ error: err.message })
  }
}
