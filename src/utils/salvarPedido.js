import { CONFIG } from '../config.js'
import { apiFetch } from './apiFetch.js'

/**
 * Salva o pedido via API e retorna o objeto criado.
 */
export async function salvarPedido(payload) {
  const res = await apiFetch('/api/pedido', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json()
}

/**
 * Formata a mensagem do pedido para WhatsApp.
 */
export function formatarMensagemWhatsApp({ pedido, itens, nome, telefone, pagamento, subtotal, troco, tipoEntrega, endereco, taxaEntrega }) {
  const agora = new Date()
  const data = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const isEntrega = tipoEntrega === 'entrega'
  const total = subtotal + (taxaEntrega || 0)

  const linhasItens = itens.map(i => {
    let linha = `🥟 ${i.nome || i.item?.nome || 'Item'} × ${i.qtd} — R$ ${(i.preco * i.qtd).toFixed(2).replace('.', ',')}`
    if (i.sabores && i.sabores.length > 0) linha += `\n   Sabores: ${i.sabores.join(', ')}`
    if (i.adicionais && i.adicionais.length > 0) linha += `\n   Adicionais: ${i.adicionais.join(', ')}`
    if (i.observacao) linha += `\n   Obs: ${i.observacao}`
    return linha
  }).join('\n\n')

  const pixInfo = pagamento === 'pix'
    ? `\n\n💠 Chave Pix: ${CONFIG.pixChave}\n   ${CONFIG.pixTipo} — ${CONFIG.pixNome}`
    : ''

  const trocoInfo = pagamento === 'dinheiro' && troco
    ? `\n   Troco para R$ ${Number(troco).toFixed(2).replace('.', ',')}`
    : ''

  const entregaInfo = isEntrega && endereco
    ? `📍 *Entrega:*\n` +
      `   ${endereco.rua}, ${endereco.numero}${endereco.complemento ? ` — ${endereco.complemento}` : ''}\n` +
      `   ${endereco.bairro}${endereco.referencia ? `\n   Ref: ${endereco.referencia}` : ''}\n`
    : `🏪 *Retirada na loja*\n`

  const taxaInfo = isEntrega && taxaEntrega > 0
    ? `\n   Taxa de entrega: R$ ${taxaEntrega.toFixed(2).replace('.', ',')}`
    : ''

  return encodeURIComponent(
    `🥟 *PEDIDO — PASTEL DO CARIOCA*\n` +
    `════════════════════════════\n` +
    `📅 ${data}  🕐 ${hora}\n` +
    `════════════════════════════\n\n` +
    `👤 *${nome}*\n` +
    `📞 ${telefone}\n` +
    entregaInfo + `\n` +
    `🛒 *ITENS:*\n\n` +
    `${linhasItens}\n\n` +
    `════════════════════════════\n` +
    `💵 *SUBTOTAL: R$ ${subtotal.toFixed(2).replace('.', ',')}*${taxaInfo}\n` +
    (isEntrega && taxaEntrega > 0 ? `💵 *TOTAL: R$ ${total.toFixed(2).replace('.', ',')}*\n` : '') +
    `💳 *Pagamento:* ${pagamento.toUpperCase()}${trocoInfo}` +
    pixInfo +
    (isEntrega ? `\n⏱ *Entrega em:* ${CONFIG.tempoRetirada}\n` : `\n⏱ *Retirada em:* ${CONFIG.tempoRetirada}\n`) +
    `════════════════════════════\n` +
    `Pedido: #${pedido.numero}`
  )
}

/**
 * Abre WhatsApp com a mensagem formatada.
 */
export function enviarWhatsApp(mensagem) {
  const url = `https://wa.me/${CONFIG.whatsappNumero}?text=${mensagem}`
  window.open(url, '_blank')
}

/**
 * Busca configurações da loja.
 */
export async function buscarConfiguracaoLoja() {
  const res = await apiFetch('/api/cardapio-state')
  if (!res.ok) return null
  return res.json()
}

/**
 * Salva configurações da loja.
 */
export async function salvarConfiguracaoLoja(config) {
  const res = await apiFetch('/api/cardapio-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error('Erro ao salvar configuração')
  return res.json()
}
