/**
 * Evolution API client — envia mensagens via WhatsApp
 * Env vars: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE
 */

const API_URL = () => (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
const API_KEY = () => process.env.EVOLUTION_API_KEY || ''
const INSTANCE = () => (process.env.EVOLUTION_INSTANCE || 'carioca').trim()

async function evoFetch(path, body) {
  const url = `${API_URL()}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY(),
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) console.error('[Evolution]', res.status, data)
  return data
}

/**
 * Envia mensagem de texto simples
 */
async function enviarTexto(telefone, texto) {
  const numero = String(telefone).replace(/\D/g, '')
  return evoFetch(`/message/sendText/${INSTANCE()}`, {
    number: numero,
    text: texto,
  })
}

/**
 * Envia mensagem com botões (se suportado pela versão)
 * Fallback para texto simples
 */
async function enviarComBotoes(telefone, titulo, texto, botoes) {
  const numero = String(telefone).replace(/\D/g, '')
  try {
    return await evoFetch(`/message/sendButtons/${INSTANCE()}`, {
      number: numero,
      title: titulo,
      description: texto,
      buttons: botoes.map((b, i) => ({ buttonId: `btn_${i}`, buttonText: { displayText: b } })),
    })
  } catch {
    // Fallback texto simples
    const botoesTexto = botoes.map((b, i) => `${i + 1}. ${b}`).join('\n')
    return enviarTexto(telefone, `${titulo}\n\n${texto}\n\n${botoesTexto}`)
  }
}

module.exports = { enviarTexto, enviarComBotoes, API_URL, API_KEY, INSTANCE }
