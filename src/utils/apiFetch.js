/**
 * Authenticated fetch wrapper for admin API calls.
 * Automatically adds x-api-key header from env var.
 *
 * Usage: import { apiFetch } from '../utils/apiFetch'
 *        apiFetch('/api/pedido', { method: 'PATCH', body: ... })
 */

const API_KEY = import.meta.env.VITE_ADMIN_API_KEY || ''

export function apiFetch(url, options = {}) {
  const headers = {
    ...options.headers,
  }
  if (API_KEY) {
    headers['x-api-key'] = API_KEY
  }
  return fetch(url, { ...options, headers })
}
