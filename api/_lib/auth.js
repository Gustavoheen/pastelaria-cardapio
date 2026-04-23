/**
 * Shared auth helper for API routes.
 * Validates x-api-key header against ADMIN_API_KEY env var.
 *
 * Usage:
 *   const { checkAdminAuth } = require('./_lib/auth')
 *   // Inside handler, for write operations:
 *   if (!checkAdminAuth(req, res)) return
 */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)

function getCorsOrigin(req) {
  const origin = req.headers.origin || ''
  if (ALLOWED_ORIGINS.length === 0) return '*' // fallback if not configured
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  return ALLOWED_ORIGINS[0] // default to first allowed origin
}

function setCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req))
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
  res.setHeader('Vary', 'Origin')
}

/**
 * Check x-api-key header for admin/write operations.
 * Returns true if authorized, false if not (and sends 401 response).
 */
function checkAdminAuth(req, res) {
  const key = process.env.ADMIN_API_KEY
  if (!key) {
    // If ADMIN_API_KEY is not configured, log warning but allow (dev mode)
    console.warn('[AUTH] ADMIN_API_KEY not set — skipping auth check')
    return true
  }
  const provided = req.headers['x-api-key']
  if (provided === key) return true
  res.status(401).json({ error: 'Nao autorizado.' })
  return false
}

module.exports = { checkAdminAuth, setCorsHeaders, getCorsOrigin }
