// ── QZ Tray - Impressão direta em térmicas ESC/POS ──
// Padrão idêntico ao Scooby-Doo Lanches
import qz from 'qz-tray'

// ── Certificado hardcoded (público, sem risco) ──
const CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDbTCCAlWgAwIBAgIUA0HcuKOUWs+SWb0kQa9fN6+pOxcwDQYJKoZIhvcNAQEL
BQAwODEaMBgGA1UEAwwRUGFzdGVsIGRvIENhcmlvY2ExGjAYBgNVBAoMEVBhc3Rl
bCBkbyBDYXJpb2NhMB4XDTI2MDQwNjAyMTA0NloXDTM2MDQwMzAyMTA0NlowODEa
MBgGA1UEAwwRUGFzdGVsIGRvIENhcmlvY2ExGjAYBgNVBAoMEVBhc3RlbCBkbyBD
YXJpb2NhMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwb90BwvLlUL+
NMX6IWnhqXNWyDXpfi/NBZ/kN/Y9Clakgk9inoOaQa49cDDVK4kkMOxqnHFGCpEs
5hbqsWXZs0SWQAeJA3PncFnr5AbzsWIK0hvhstqcIPfdkO9W9iOAkVkfsRRU9dsk
qLKazBfMoYLZ6/ae4OBvGLifAJ2etSqL7YWgUSs6z5AF//H9eHOXjxnqHorwUhp/
ivP1DytvxhngtcOJIo283ZBr2hAiaFN0aHOdYMflxJ59wbj1BZReei3qUIZuurkz
2ckaQSGGpT4eCp58QWPDHCt8BeQEZztHQAdpEhUcCxXVbLy/K8KqMoLBFGKKmu59
CWvjB+Dy4wIDAQABo28wbTAdBgNVHQ4EFgQUXm/5Fb4eiL3yB1eWGnOth+GbIWAw
HwYDVR0jBBgwFoAUXm/5Fb4eiL3yB1eWGnOth+GbIWAwCQYDVR0TBAIwADALBgNV
HQ8EBAMCB4AwEwYDVR0lBAwwCgYIKwYBBQUHAwMwDQYJKoZIhvcNAQELBQADggEB
ADtuBkFzgxM5c61ty/iuUR4iA2ZqXYyhXvTffNv3Z7Mnebev6vednZm9uzixdfBr
KhF0ICRGXftRIIZnaUHC5SqEnjR0WFsdTenQIWbJYgsrTP7gFFBNdSsvaGrwb197
OS9NYya02CqVTUvcw4oCRYQIo22APt9g1Mx+MTr95wPTRln0qiPVR5YWxGCs1dJG
n3ilIBUSzsPUXHH3hV6eaooladaeJdBPf3aaD8XhJDekEhxAYeIW7ZTdGo6YWiPh
zlWVR4CmVPgM/B2ESFNJRZeQdDLetWceh9AeDiWPpDMZndVf0sTH/8inb74FYbxa
RhUkFfixwELqxksoeqhEMb8=
-----END CERTIFICATE-----`

// ── Assinar via API (chave privada fica segura no Vercel) ──
async function assinarQZ(toSign) {
  const resp = await fetch(`/api/qz-sign?toSign=${encodeURIComponent(toSign)}`)
  if (!resp.ok) throw new Error('Erro ao assinar: ' + resp.status)
  return resp.text()
}

// ── Configurar segurança QZ (igual Scooby) ──
function configurarQZ() {
  qz.security.setCertificatePromise((resolve) => resolve(CERTIFICATE))
  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setSignaturePromise((toSign) => (resolve, reject) =>
    assinarQZ(toSign).then(resolve).catch(reject)
  )
}

// ── Conectar QZ Tray ──
async function conectarQZ() {
  configurarQZ()
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 3, delay: 1 })
  }
  return qz
}

export async function listarImpressoras() {
  await conectarQZ()
  return await qz.printers.find()
}

export async function buscarImpressora(nome) {
  await conectarQZ()
  try {
    return await qz.printers.find(nome)
  } catch {
    const todas = await qz.printers.find()
    const match = todas.find(p => p.toLowerCase().includes(nome.toLowerCase()))
    return match || null
  }
}

// Nome padrão da impressora do cliente
const IMPRESSORA_PADRAO = 'POS80 Printer'

// ── Helpers para gerar bytes ESC/POS (80mm = 48 colunas) ──
const COLS = 48

function encode(str) {
  const ascii = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7F]/g, '?')
  return ascii.split('').map(c => c.charCodeAt(0))
}

function gerarESCPOS(pedido, itens) {
  const bytes = []
  const push  = (...b) => bytes.push(...b)
  const txt   = (s) => bytes.push(...encode(String(s)))
  const nl    = (n = 1) => { for (let i = 0; i < n; i++) push(0x0A) }
  const centro = () => push(0x1B, 0x61, 0x01)
  const esq    = () => push(0x1B, 0x61, 0x00)
  const bold   = (on) => push(0x1B, 0x45, on ? 1 : 0)
  const grande = () => push(0x1D, 0x21, 0x11) // 2x largura + 2x altura
  const normal = () => push(0x1D, 0x21, 0x00)

  // Tamanhos intermediários
  const altoLargo = () => push(0x1D, 0x21, 0x11) // 2x largura + 2x altura
  const alto      = () => push(0x1D, 0x21, 0x01) // 2x altura apenas
  const largo     = () => push(0x1D, 0x21, 0x10) // 2x largura apenas

  const linha  = '-'.repeat(COLS)
  const linhaD = '='.repeat(COLS)

  function fmtPreco(v) {
    return 'R$ ' + Number(v).toFixed(2).replace('.', ',')
  }

  // Init
  push(0x1B, 0x40)

  // Cabeçalho — pequeno (fonte normal, só negrito)
  centro(); bold(true)
  txt('PASTEL DO CARIOCA'); nl()
  bold(false)
  txt('Pasteis Fresquinhos!'); nl()
  nl()

  // Número do pedido — grande destaque
  centro(); bold(true); altoLargo()
  txt('PEDIDO #' + (pedido.numero || '')); nl()
  normal(); nl()

  esq()
  txt(linha); nl()

  // Data/Hora — negrito, altura dupla, destaque
  centro(); bold(true); alto()
  const agora = pedido.created_at ? new Date(pedido.created_at) : new Date()
  const dataStr = agora.toLocaleDateString('pt-BR')
  const horaStr = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  txt(dataStr + '  ' + horaStr); nl()
  normal(); bold(false)

  esq()
  txt(linha); nl()

  // Itens
  centro(); bold(true); alto()
  txt('--- ITENS ---'); nl()
  normal(); bold(false); esq()

  for (const item of itens) {
    const qtd = item.qtd || item.quantidade || 1
    const nome = (item.nome || 'Item')
    const precoItem = fmtPreco((item.preco || 0) * qtd)
    nl()

    // Nome do item — grande destaque
    bold(true); alto()
    txt(qtd + 'x ' + nome); nl()
    normal(); bold(false)

    // Sabores — negrito, cada um na sua linha pra ficar limpo
    if (item.sabores?.length > 0) {
      bold(true)
      for (const sab of item.sabores) {
        txt('  > ' + sab); nl()
      }
      bold(false)
    }

    // Adicionais — negrito, cada um na linha
    if (item.adicionais?.length > 0) {
      bold(true)
      txt('  + '); txt(item.adicionais.join(', ')); nl()
      bold(false)
    }

    // Observação — destaque
    if (item.observacao) {
      bold(true)
      txt('  * ' + item.observacao); nl()
      bold(false)
    }

    // Preço — discreto, alinhado direita
    txt('              ' + precoItem); nl()
  }

  nl(); txt(linhaD); nl()

  // Total — grande destaque
  centro(); bold(true); altoLargo()
  txt('TOTAL: ' + fmtPreco(pedido.total)); nl()
  normal(); bold(false); nl()

  // Pagamento — altura dupla, negrito
  esq(); bold(true); alto()
  txt('Pgto: ' + (pedido.pagamento || '').toUpperCase()); nl()
  normal(); bold(false)
  if (pedido.pagamento === 'dinheiro' && pedido.troco) {
    const valorTroco = Number(pedido.troco) - Number(pedido.total)
    txt('Troco para: ' + fmtPreco(pedido.troco)); nl()
    if (valorTroco > 0) {
      bold(true); alto()
      txt('TROCO: ' + fmtPreco(valorTroco)); nl()
      normal(); bold(false)
    }
  }

  txt(linha); nl()

  // Entrega
  if (pedido.tipo_entrega === 'entrega' && pedido.endereco) {
    bold(true); alto()
    txt('ENTREGA:'); normal(); bold(false); nl()
    txt(pedido.endereco); nl()
  } else {
    bold(true); txt('RETIRADA NA LOJA'); bold(false); nl()
  }

  txt(linha); nl()

  // Cliente — altura dupla, negrito
  bold(true); alto()
  txt(pedido.nome || ''); nl()
  normal(); bold(false)
  txt('Tel: ' + (pedido.telefone || '')); nl()

  txt(linha); nl()

  // Rodapé — fonte normal
  centro()
  txt('Obrigado pela preferencia!'); nl()
  txt('pasteldocariocavrb.com.br'); nl()
  nl(3)

  // Corte parcial (igual Scooby)
  push(0x1D, 0x56, 0x41, 0x10)

  return new Uint8Array(bytes)
}

function parseItens(raw) {
  if (!raw) return []
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return Array.isArray(raw) ? raw : []
}

function fmtPrecoStr(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',')
}

function padCols(left, right, total = COLS) {
  const l = String(left)
  const r = String(right)
  const space = Math.max(1, total - l.length - r.length)
  return l + ' '.repeat(space) + r
}

function gerarESCPOSFechamento(relatorio) {
  const bytes = []
  const push  = (...b) => bytes.push(...b)
  const txt   = (s) => bytes.push(...encode(String(s)))
  const nl    = (n = 1) => { for (let i = 0; i < n; i++) push(0x0A) }
  const centro = () => push(0x1B, 0x61, 0x01)
  const esq    = () => push(0x1B, 0x61, 0x00)
  const bold   = (on) => push(0x1B, 0x45, on ? 1 : 0)
  const altoLargo = () => push(0x1D, 0x21, 0x11)
  const alto      = () => push(0x1D, 0x21, 0x01)
  const normal    = () => push(0x1D, 0x21, 0x00)

  const linha  = '-'.repeat(COLS)
  const linhaD = '='.repeat(COLS)

  const ini = Number(relatorio.valorInicial || 0)
  const fin = relatorio.valorFinal == null ? null : Number(relatorio.valorFinal)
  const vendDinheiro = Number(relatorio.porPagamento?.dinheiro || 0)
  const esperado = ini + vendDinheiro
  const diferenca = relatorio.diferenca == null ? null : Number(relatorio.diferenca)

  // Init
  push(0x1B, 0x40)

  // Cabeçalho
  centro(); bold(true)
  txt('PASTEL DO CARIOCA'); nl()
  altoLargo()
  txt('FECHAMENTO DE CAIXA'); nl()
  normal(); bold(false); nl()

  // Data/Hora
  centro(); bold(true); alto()
  txt(`${relatorio.data || ''}  ${relatorio.hora || ''}`); nl()
  normal(); bold(false)
  esq(); txt(linha); nl()

  // Conferência de dinheiro
  bold(true); txt('CONFERENCIA DO CAIXA'); bold(false); nl()
  txt(padCols('Troco inicial:', fmtPrecoStr(ini))); nl()
  txt(padCols('Vendas em dinheiro:', fmtPrecoStr(vendDinheiro))); nl()
  bold(true)
  txt(padCols('Esperado no caixa:', fmtPrecoStr(esperado))); nl()
  bold(false)

  if (fin != null) {
    txt(padCols('Valor contado:', fmtPrecoStr(fin))); nl()
    nl()
    const sobrou = diferenca > 0
    const zerou  = diferenca === 0
    const label  = zerou ? 'CAIXA OK' : sobrou ? 'SOBROU' : 'FALTOU'
    const sinal  = zerou ? '' : (sobrou ? '+ ' : '- ')
    bold(true); alto()
    txt(padCols('DIFERENCA:', `${sinal}${fmtPrecoStr(Math.abs(diferenca))}`, COLS / 2 | 0)); nl()
    txt(`>> ${label}`); nl()
    normal(); bold(false)
  } else {
    nl(); txt('  (valor final nao informado)'); nl()
  }

  txt(linha); nl()

  // Vendas por pagamento
  centro(); bold(true); alto()
  txt('--- POR PAGAMENTO ---'); nl()
  normal(); bold(false); esq()

  const pags = relatorio.porPagamento || {}
  const entries = Object.entries(pags)
  if (entries.length === 0) {
    txt('  Nenhuma venda registrada.'); nl()
  } else {
    for (const [pag, val] of entries) {
      const nome = String(pag).toUpperCase()
      txt(padCols(nome, fmtPrecoStr(val))); nl()
    }
  }

  txt(linha); nl()

  // Totais por origem
  bold(true); txt('TOTAIS POR ORIGEM'); bold(false); nl()
  txt(padCols('Balcao:', fmtPrecoStr(relatorio.totalBalcao))); nl()
  txt(padCols('Site / App:', fmtPrecoStr(relatorio.totalSite))); nl()

  txt(linhaD); nl()

  // Total geral
  centro(); bold(true); altoLargo()
  txt('TOTAL DO DIA'); nl()
  txt(fmtPrecoStr(relatorio.totalDia)); nl()
  normal(); bold(false)
  txt(`${relatorio.qtdVendas || 0} vendas`); nl()
  esq()

  txt(linhaD); nl(2)

  // Assinaturas
  centro()
  txt('Operador: ___________________'); nl(2)
  txt('Conferido: __________________'); nl(2)
  esq()

  nl(3)

  // Corte parcial
  push(0x1D, 0x56, 0x41, 0x10)

  return new Uint8Array(bytes)
}

export async function imprimirFechamentoQZ(relatorio, nomeImpressora) {
  if (!qz.websocket.isActive()) {
    await conectarQZ()
  }

  const bytesArr = gerarESCPOSFechamento(relatorio)

  const printer = nomeImpressora || getNomeImpressoraSalva()
  if (!printer) throw new Error('Nenhuma impressora configurada')

  let impressoraFinal = printer
  try {
    await qz.printers.find(printer)
  } catch {
    impressoraFinal = await qz.printers.getDefault()
  }

  const config = qz.configs.create(impressoraFinal)

  let bin = ''
  for (let i = 0; i < bytesArr.length; i++) bin += String.fromCharCode(bytesArr[i])

  await qz.print(config, [{
    type: 'raw',
    format: 'base64',
    data: btoa(bin),
  }])
}

export async function imprimirPedidoQZ(pedido, nomeImpressora) {
  // Reconecta se caiu
  if (!qz.websocket.isActive()) {
    await conectarQZ()
  }

  const itens = parseItens(pedido.itens)
  const bytesArr = gerarESCPOS(pedido, itens)

  const printer = nomeImpressora || getNomeImpressoraSalva()
  if (!printer) throw new Error('Nenhuma impressora configurada')

  // Verificar se impressora existe, senão usa default
  let impressoraFinal = printer
  try {
    await qz.printers.find(printer)
  } catch {
    impressoraFinal = await qz.printers.getDefault()
  }

  const config = qz.configs.create(impressoraFinal)

  // Converter bytes pra base64 (igual Scooby)
  let bin = ''
  for (let i = 0; i < bytesArr.length; i++) bin += String.fromCharCode(bytesArr[i])

  await qz.print(config, [{
    type: 'raw',
    format: 'base64',
    data: btoa(bin),
  }])
}

export function getNomeImpressoraSalva() {
  return localStorage.getItem('qz_impressora') || IMPRESSORA_PADRAO
}

export function salvarNomeImpressora(nome) {
  localStorage.setItem('qz_impressora', nome)
}

// ── Heartbeat: reconecta websocket a cada 20s + ping ESC@ na impressora a cada 3min ──
let heartbeatInterval = null
let pingInterval = null

export function iniciarKeepAlive(nomeImpressora) {
  pararKeepAlive()
  if (!nomeImpressora) return

  // Reconectar websocket se cair (a cada 20s)
  heartbeatInterval = setInterval(async () => {
    if (!qz.websocket.isActive()) {
      try {
        configurarQZ()
        await qz.websocket.connect()
      } catch {}
    }
  }, 20000)

  // Ping ESC@ na impressora pra não desligar (a cada 3min)
  async function pingImpressora() {
    try {
      if (!qz.websocket.isActive()) return
      const config = qz.configs.create(nomeImpressora)
      // ESC @ = init sem imprimir nada, só mantém ativa
      await qz.print(config, [{ type: 'raw', format: 'base64', data: btoa('\x1B\x40') }])
    } catch {}
  }

  pingImpressora()
  pingInterval = setInterval(pingImpressora, 3 * 60 * 1000) // 3 minutos
}

export function pararKeepAlive() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null }
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null }
}

export async function verificarQZConectado() {
  try {
    configurarQZ()
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect()
    }
    return true
  } catch {
    return false
  }
}
