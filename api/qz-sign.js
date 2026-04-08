const crypto = require('crypto')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Aceita GET (igual Scooby) e POST (compatibilidade)
  const toSign = req.query.toSign || (req.body && req.body.request)
  if (!toSign) return res.status(400).json({ error: 'toSign required' })

  const privateKey = process.env.QZ_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!privateKey) return res.status(500).json({ error: 'Chave não configurada' })

  try {
    const sign = crypto.createSign('SHA512')
    sign.update(toSign)
    const signature = sign.sign(privateKey, 'base64')
    // Retorna texto puro (igual Scooby)
    res.status(200).send(signature)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
