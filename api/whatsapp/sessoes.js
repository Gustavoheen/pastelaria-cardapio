/**
 * Gerenciamento de sessões WhatsApp (conversas).
 * GET    → lista sessões ativas
 * PATCH  → assumir/devolver conversa (humano_ativo true/false)
 * DELETE → resetar sessão
 */

const { createClient } = require('@supabase/supabase-js')
const { enviarTexto } = require('../_lib/evolution')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const { checkAdminAuth, setCorsHeaders } = require('../_lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  // All session operations are admin-only
  if (!checkAdminAuth(req, res)) return

  try {
    /* ── GET → listar sessões ── */
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('carioca_whatsapp_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50)

      if (error) { console.error('[sessoes GET]', error.message); return res.status(500).json({ error: 'Erro interno.' }) }
      return res.status(200).json(data || [])
    }

    /* ── PATCH → assumir/devolver ou enviar msg ── */
    if (req.method === 'PATCH') {
      const { telefone, humano_ativo, mensagem } = req.body
      if (!telefone) return res.status(400).json({ error: 'telefone obrigatório' })

      // Enviar mensagem manual
      if (mensagem) {
        await enviarTexto(telefone, mensagem)

        // Marca como humano ativo automaticamente
        await supabase
          .from('carioca_whatsapp_sessions')
          .update({ humano_ativo: true, estado: 'humano', updated_at: new Date().toISOString() })
          .eq('telefone', telefone)

        return res.status(200).json({ ok: true, action: 'msg_enviada' })
      }

      // Alternar modo humano/bot
      if (humano_ativo !== undefined) {
        const updates = {
          humano_ativo: !!humano_ativo,
          updated_at: new Date().toISOString(),
        }
        if (!humano_ativo) {
          updates.estado = 'saudacao' // volta pro fluxo do bot
        }

        await supabase
          .from('carioca_whatsapp_sessions')
          .update(updates)
          .eq('telefone', telefone)

        if (humano_ativo) {
          await enviarTexto(telefone, '👤 Um atendente assumiu seu atendimento. Como posso ajudar?')
        } else {
          await enviarTexto(telefone, '🤖 Obrigado! Voltando ao atendimento automático. 😊')
        }

        return res.status(200).json({ ok: true, humano_ativo: !!humano_ativo })
      }

      return res.status(400).json({ error: 'Nenhuma ação especificada' })
    }

    /* ── DELETE → resetar sessão ── */
    if (req.method === 'DELETE') {
      const { telefone } = req.query
      if (!telefone) return res.status(400).json({ error: 'telefone obrigatório' })

      await supabase
        .from('carioca_whatsapp_sessions')
        .delete()
        .eq('telefone', telefone)

      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[Sessões]', err)
    console.error('[sessoes]', err.message); return res.status(500).json({ error: 'Erro interno.' })
  }
}
