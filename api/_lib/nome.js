/**
 * Utilitarios de normalizacao de nomes de cliente.
 */

const CONECTIVOS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'van', 'von', 'la', 'le'])

// Regex para remover acentos e diacriticos (combining marks U+0300 a U+036F)
const REGEX_DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Formata nome para armazenamento (Title Case PT-BR).
 * "joao  DA silva" -> "Joao da Silva"
 * "BEICO" -> "Beico"
 * "maria conceicao" -> "Maria Conceicao"
 */
function formatarNome(str) {
  if (!str) return ''
  const limpo = String(str).trim().replace(/\s+/g, ' ').toLowerCase()
  if (!limpo) return ''
  return limpo.split(' ').map((p, idx) => {
    if (!p) return p
    // Conectivos (exceto no comeco) ficam em minusculo
    if (idx > 0 && CONECTIVOS.has(p)) return p
    return p.charAt(0).toUpperCase() + p.slice(1)
  }).join(' ')
}

/**
 * Chave normalizada para comparacao/dedup (ignora acentos/cedilha/caixa).
 * "Joao da Silva" -> "joao da silva"
 * "BEICO" -> "beico"
 */
function chaveNome(str) {
  if (!str) return ''
  return String(str)
    .normalize('NFD')
    .replace(REGEX_DIACRITICOS, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

module.exports = { formatarNome, chaveNome }
