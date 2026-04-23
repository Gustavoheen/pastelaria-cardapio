/**
 * Debug endpoint — loga payloads do webhook para diagnóstico.
 * GET  → retorna últimos payloads recebidos
 * POST → recebe e armazena payload
 */

const logs = []

const { checkAdminAuth, setCorsHeaders } = require('../_lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  // Debug endpoint must require admin auth — it exposes webhook payloads
  if (!checkAdminAuth(req, res)) return

  if (req.method === 'GET') {
    return res.status(200).json({ count: logs.length, logs: logs.slice(-10) })
  }

  if (req.method === 'POST') {
    const body = req.body
    logs.push({
      ts: new Date().toISOString(),
      event: body?.event,
      hasData: !!body?.data,
      hasKey: !!body?.data?.key,
      remoteJid: body?.data?.key?.remoteJid || null,
      fromMe: body?.data?.key?.fromMe || null,
      messageType: body?.data?.messageType || null,
      pushName: body?.data?.pushName || null,
      bodyKeys: Object.keys(body || {}),
      dataKeys: Object.keys(body?.data || {}),
    })
    if (logs.length > 50) logs.shift()
    return res.status(200).json({ ok: true, logged: true })
  }

  return res.status(405).end()
}
