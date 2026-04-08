/**
 * Gerenciamento da instância Evolution API.
 * GET  → status da instância + QR code se desconectado
 * POST → cria instância + configura webhook
 * DELETE → desconecta instância
 */

const EVO_URL = () => (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
const EVO_KEY = () => process.env.EVOLUTION_API_KEY || ''
const EVO_INST = () => (process.env.EVOLUTION_INSTANCE || 'carioca').trim()

function evoFetch(path, options = {}, timeoutMs = 6000) {
  const url = `${EVO_URL()}${path}`
  if (!EVO_URL()) return Promise.resolve({})
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, headers: { apikey: EVO_KEY(), ...options.headers }, signal: controller.signal })
    .then(r => r.json().catch(() => ({})))
    .catch(() => ({}))
    .finally(() => clearTimeout(timer))
}

async function evoGet(path) {
  return evoFetch(path)
}

async function evoPost(path, body) {
  return evoFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function evoDel(path) {
  return evoFetch(path, { method: 'DELETE' })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const instance = EVO_INST()
  const webhookUrl = 'https://pasteldocariocavrb.com.br/api/whatsapp/webhook'

  try {
    /* ── GET → status (+ QR se ?qr=1) ── */
    if (req.method === 'GET') {
      // Se Evolution API não está configurada, retornar logo
      if (!EVO_URL()) {
        return res.status(200).json({ connected: false, exists: false, instance, error: 'EVOLUTION_API_URL não configurada' })
      }

      const statusRes = await evoGet(`/instance/connectionState/${instance}`)

      // Se instância não existe ou houve erro
      if (!statusRes || statusRes?.error || statusRes?.status === 404 || statusRes?.status === 400 || statusRes?.statusCode === 404 || statusRes?.statusCode === 400) {
        return res.status(200).json({ connected: false, exists: false, instance })
      }

      const state = statusRes?.instance?.state || statusRes?.state || 'close'
      const connected = state === 'open'

      // QR só é buscado quando ?qr=1 (evita spam de chamadas no polling)
      let qrcode = null
      if (!connected && req.query.qr === '1') {
        const qrRes = await evoGet(`/instance/connect/${instance}`)
        qrcode = qrRes?.base64 || qrRes?.qrcode?.base64 || qrRes?.code || null
      }

      return res.status(200).json({
        connected,
        exists: true,
        state,
        instance,
        qrcode,
      })
    }

    /* ── POST → criar instância + webhook ── */
    if (req.method === 'POST') {
      // Criar instância (ou reconectar se já existe)
      let createRes
      try {
        createRes = await evoPost('/instance/create', {
          instanceName: instance,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          },
        })
      } catch {
        // Se já existe, tentar conectar
        createRes = await evoGet(`/instance/connect/${instance}`)
      }

      // Configurar webhook separadamente
      await evoPost(`/webhook/set/${instance}`, {
        webhook: {
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          enabled: true,
        },
      }).catch(() => {})

      const qrcode = createRes?.qrcode?.base64 || createRes?.base64 || null
      const pairingCode = createRes?.qrcode?.pairingCode || null

      return res.status(200).json({
        ok: true,
        instance,
        qrcode,
        pairingCode,
        webhookUrl,
      })
    }

    /* ── DELETE → desconectar/logout ── */
    if (req.method === 'DELETE') {
      const action = req.query.action || 'logout'

      if (action === 'delete') {
        const result = await evoDel(`/instance/delete/${instance}`)
        return res.status(200).json({ ok: true, action: 'deleted', result })
      }

      // Logout (desconecta mas mantém instância)
      const result = await evoDel(`/instance/logout/${instance}`)
      return res.status(200).json({ ok: true, action: 'logout', result })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[Instance]', err)
    return res.status(500).json({ error: err.message })
  }
}
