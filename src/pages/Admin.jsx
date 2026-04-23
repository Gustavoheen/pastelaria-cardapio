import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  LayoutDashboard, Package, UtensilsCrossed, BarChart2, FileText,
  Settings, Printer, LogOut, Menu, X, DollarSign, TrendingUp, Clock,
  ChevronLeft, ChevronRight, Plus, Minus, Pencil, Trash2, Check,
  Wifi, WifiOff, Bell, RefreshCw, Store, ShoppingCart, Banknote, Calendar, Users,
  MessageCircle, Send, QrCode, UserCheck, Power, Bot, Search,
  BookOpen, UserPlus, CreditCard, Percent, Tag,
} from 'lucide-react'
import { CONFIG } from '../config.js'
import { apiFetch } from '../utils/apiFetch.js'
import { imprimirPedidoQZ, listarImpressoras, buscarImpressora, getNomeImpressoraSalva, salvarNomeImpressora, verificarQZConectado, iniciarKeepAlive, pararKeepAlive } from '../utils/qzPrint.js'
import { TIPOS_PASTEL, PASTEIS_DOCES, categorias, SABORES_SALGADOS, SABORES_DOCES, ADICIONAIS_LISTA } from '../data/cardapio.js'

// ── Paleta ────────────────────────────────────────────────────
const C = {
  bg:         'rgba(255,235,235,0.88)',
  card:       'rgba(255,255,255,0.82)',
  cardBorder: 'rgba(150,0,0,0.42)',
  cardShadow: '0 3px 14px rgba(130,0,0,0.14), 0 1px 4px rgba(130,0,0,0.08)',
  red:        '#C62828',
  redDark:    '#8B0000',
  gold:       '#92400E',
  text:       '#1A0000',
  muted:      'rgba(15,0,0,0.82)',
  success:    '#166534',
  warning:    '#92400E',
  danger:     '#991B1B',
  chartLine:  '#C62828',
  chartArea:  'rgba(198,40,40,0.15)',
}

// ── STATUS FLOW ───────────────────────────────────────────────
const STATUS_FLOW = {
  recebido:   { label: 'Recebido',   cor: '#F5C800', proximo: 'preparando', anterior: null,       rotulo: 'Iniciar preparo' },
  preparando: { label: 'Preparando', cor: '#FF5252', proximo: 'pronto',     anterior: 'recebido', rotulo: 'Marcar pronto' },
  pronto:     { label: 'Pronto',     cor: '#00e676', proximo: 'entregue',   anterior: 'preparando', rotulo: 'Marcar retirado' },
  entregue:   { label: 'Retirado',   cor: '#aaa',    proximo: null,         anterior: 'pronto',   rotulo: null },
}

// ── Beep (AudioContext, 800Hz, 1s, max volume) ───────────────
function tocarBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 800
    gain.gain.value = 1.0
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 1.0)
    osc.onended = () => ctx.close()
  } catch (_) {}
}

// ── Voz síntese ──────────────────────────────────────────────
function falarVoz(texto) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(texto)
  u.lang = 'pt-BR'
  u.rate = 0.88
  u.pitch = 1.05
  u.volume = 1
  // Prefere voz pt-BR se disponível
  const vozes = window.speechSynthesis.getVoices()
  const ptBR = vozes.find(v => v.lang === 'pt-BR') || vozes.find(v => v.lang.startsWith('pt'))
  if (ptBR) u.voice = ptBR
  window.speechSynthesis.speak(u)
}

// ── Utilitários ───────────────────────────────────────────────
function fmtHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtData(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMoeda(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
}

// Soma de preços sem erros de ponto flutuante (usa centavos inteiros)
function somarCart(cart) {
  const centavos = cart.reduce((s, i) => s + Math.round(Number(i.preco || 0) * 100) * Number(i.qtd || 1), 0)
  return centavos / 100
}

function ehHoje(iso) {
  if (!iso) return false
  return new Date(iso).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
}

function minutosAtras(iso) {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso)) / 60000)
}

function parseItens(raw) {
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw || '[]') } catch (_) { return [] }
}

// ── Hook: timer ao vivo ───────────────────────────────────────
function useTimer(createdAt) {
  const [minutos, setMinutos] = useState(() => minutosAtras(createdAt))
  useEffect(() => {
    const calc = () => setMinutos(minutosAtras(createdAt))
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [createdAt])
  return minutos
}

// ── Tooltip Recharts ──────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(255,235,235,0.92)', border: '1px solid rgba(229,57,53,0.3)',
      borderRadius: '10px', padding: '8px 12px', backdropFilter: 'blur(12px)',
    }}>
      <p style={{ color: C.muted, fontSize: '0.75rem', margin: '0 0 2px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: C.gold, fontWeight: 700, margin: 0 }}>
          R$ {Number(p.value).toFixed(2).replace('.', ',')}
        </p>
      ))}
    </div>
  )
}

function CustomTooltipCount({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(255,235,235,0.92)', border: '1px solid rgba(229,57,53,0.3)',
      borderRadius: '10px', padding: '8px 12px', backdropFilter: 'blur(12px)',
    }}>
      <p style={{ color: C.muted, fontSize: '0.75rem', margin: '0 0 2px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: C.gold, fontWeight: 700, margin: 0 }}>{p.value}x</p>
      ))}
    </div>
  )
}

// ── Badge de status ───────────────────────────────────────────
function BadgeStatus({ status }) {
  const info = STATUS_FLOW[status] || STATUS_FLOW.recebido
  return (
    <span style={{
      background: info.cor + '28', color: info.cor,
      border: `1px solid ${info.cor}55`,
      fontSize: '0.82rem', fontWeight: 700,
      padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {info.label}
    </span>
  )
}

function BadgePagamento({ pag }) {
  const map = {
    pix:      { bg: 'rgba(0,200,83,0.18)', border: 'rgba(0,200,83,0.4)', cor: '#00c853', label: 'PIX' },
    dinheiro: { bg: 'rgba(245,200,0,0.15)', border: 'rgba(245,200,0,0.4)', cor: '#F5C800', label: 'Dinheiro' },
    debito:   { bg: 'rgba(33,150,243,0.15)', border: 'rgba(33,150,243,0.4)', cor: '#2196F3', label: 'Débito' },
    credito:  { bg: 'rgba(156,39,176,0.15)', border: 'rgba(156,39,176,0.4)', cor: '#9C27B0', label: 'Crédito' },
  }
  const key = (pag || '').toLowerCase().replace(/\s/g, '')
  const s = map[key] || { bg: 'rgba(255,235,235,0.75)', border: C.cardBorder, cor: C.muted, label: pag?.toUpperCase() || '—' }
  return (
    <span style={{
      background: s.bg, border: `1px solid ${s.border}`, color: s.cor,
      fontSize: '0.82rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ── Print Area ────────────────────────────────────────────────
function PrintArea({ pedido }) {
  if (!pedido) return null
  const itens = parseItens(pedido.itens)
  const hora = fmtHora(pedido.created_at)
  const data = fmtData(pedido.created_at)
  return (
    <div id="print-area" style={{ display: 'none', fontFamily: 'Courier New, monospace', fontSize: '11px', width: '80mm', color: '#000', background: '#fff', padding: '8px' }}>
      <div style={{ textAlign: 'center', fontWeight: 900, fontSize: '13px' }}>PASTEL DO CARIOCA</div>
      <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '4px' }}>Pasteis Fresquinhos!</div>
      <div>{'━'.repeat(28)}</div>
      <div>Pedido: {pedido.numero}</div>
      <div>{data}  {hora}</div>
      <div>{'━'.repeat(28)}</div>
      <div style={{ marginBottom: '4px' }}>ITENS:</div>
      {itens.map((item, i) => (
        <div key={i}>
          <div>• {item.qtd || item.quantidade || 1}x {(item.nome || 'Item').substring(0, 20)}</div>
          {item.sabores?.length > 0 && <div style={{ paddingLeft: '6px' }}>Sabores: {item.sabores.join(', ')}</div>}
          {item.adicionais?.length > 0 && <div style={{ paddingLeft: '6px' }}>Adicionais: {item.adicionais.join(', ')}</div>}
          {item.observacao && <div style={{ paddingLeft: '6px' }}>Obs: {item.observacao}</div>}
        </div>
      ))}
      <div>{'━'.repeat(28)}</div>
      <div style={{ fontWeight: 700 }}>TOTAL: {fmtMoeda(pedido.total)}</div>
      <div>Pagamento: {pedido.pagamento?.toUpperCase()}</div>
      {pedido.pagamento === 'dinheiro' && pedido.troco > 0 && (
        <>
          <div>Troco para: {fmtMoeda(pedido.troco)}</div>
          {Number(pedido.troco) - Number(pedido.total) > 0 && (
            <div style={{ fontWeight: 700 }}>TROCO: {fmtMoeda(Number(pedido.troco) - Number(pedido.total))}</div>
          )}
        </>
      )}
      <div>{pedido.tipo_entrega === 'entrega' && pedido.endereco ? `ENTREGA: ${pedido.endereco}` : 'RETIRADA NA LOJA'}</div>
      <div>{'━'.repeat(28)}</div>
      <div>CLIENTE: {pedido.nome}</div>
      <div>Tel: {pedido.telefone}</div>
      <div>{'━'.repeat(28)}</div>
      <div style={{ textAlign: 'center', marginTop: '4px' }}>Obrigado!</div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, valor, sub, corSub, corVal }) {
  return (
    <div style={{
      background: 'rgba(255,235,235,0.70)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '1.25rem',
      boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '10px',
          background: 'rgba(229,57,53,0.15)', border: '1px solid rgba(229,57,53,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color="#FF7777" />
        </div>
        <span style={{ color: 'rgba(15,0,0,0.85)', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      </div>
      <div style={{ color: corVal || '#1A0000', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.85rem', letterSpacing: '1px', lineHeight: 1 }}>
        {valor}
      </div>
      {sub && <div style={{ color: corSub || C.muted, fontSize: '0.73rem', fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}

// ── Timer Badge ───────────────────────────────────────────────
function TimerBadge({ createdAt, style = {} }) {
  const min = useTimer(createdAt)
  const cor = min < 10 ? C.success : min < 20 ? C.warning : C.danger
  return (
    <span style={{
      color: cor, fontSize: '0.85rem', fontWeight: 700,
      background: cor + '18', border: `1px solid ${cor}44`,
      borderRadius: '20px', padding: '3px 9px', whiteSpace: 'nowrap',
      ...style,
    }}>
      ha {min}min
    </span>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA 1: DASHBOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PaginaDashboard({ pedidos, onVerPedidos, onExcluir, onSalvarPedido, carregarPedidos, onImprimir }) {
  const pedidosHoje = pedidos.filter(p => ehHoje(p.created_at))
  const faturamentoHoje = pedidosHoje.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const ticketMedio = pedidosHoje.length > 0 ? faturamentoHoje / pedidosHoje.length : 0
  const pendentes = pedidos.filter(p => p.status === 'recebido' || p.status === 'preparando').length
  const descontosHoje = pedidosHoje.filter(p => Number(p.desconto_valor) > 0)
  const totalDescontosHoje = descontosHoje.reduce((s, p) => s + (Number(p.desconto_valor) || 0), 0)

  // Filtro de data do fluxo de caixa
  const [periodoFluxo, setPeriodoFluxo] = useState('hoje')
  const [dataCustomFluxo, setDataCustomFluxo] = useState('')

  function getDataStr(offset = 0) {
    const d = new Date(); d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function mudarPeriodoFluxo(p) {
    setPeriodoFluxo(p)
    const hoje = getDataStr(0)
    if (p === 'hoje') carregarPedidos(false, hoje)
    else if (p === 'ontem') carregarPedidos(false, getDataStr(-1))
    else if (p === 'semana') carregarPedidos(false, getDataStr(-6), hoje)
    else if (p === 'mes') {
      const d = new Date()
      const ini = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
      carregarPedidos(false, ini, hoje)
    }
  }

  function mudarDataCustomFluxo(val) {
    setDataCustomFluxo(val)
    setPeriodoFluxo('custom')
    if (val) carregarPedidos(false, val)
  }

  const [editandoId, setEditandoId] = useState(null)
  const [editItens, setEditItens] = useState([])
  const [editPag, setEditPag] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Conferência de caixa
  const hoje = new Date().toISOString().slice(0, 10)
  const keyInicial = `carioca_caixa_inicial_${hoje}`
  const keyFinal   = `carioca_caixa_final_${hoje}`
  const keyFechado = `carioca_caixa_fechado_${hoje}`
  const [valorInicial, setValorInicial] = useState(() => localStorage.getItem(keyInicial) || '')
  const [valorFinal,   setValorFinal]   = useState(() => localStorage.getItem(keyFinal)   || '')
  const [conferenciAberta, setConferenciaAberta] = useState(false)
  const [caixaFechado, setCaixaFechado] = useState(() => {
    try { return JSON.parse(localStorage.getItem(keyFechado) || 'null') } catch { return null }
  })

  function salvarValorInicial(v) { setValorInicial(v); localStorage.setItem(keyInicial, v) }
  function salvarValorFinal(v)   { setValorFinal(v);   localStorage.setItem(keyFinal,   v) }

  function fecharCaixa() {
    if (!window.confirm('Confirmar fechamento do caixa? Isso registra o relatório do dia.')) return
    const ini = parseFloat(valorInicial) || 0
    const fin = parseFloat(valorFinal)
    const vendDinheiro = porPag['dinheiro'] || 0
    const esperado = ini + vendDinheiro
    const relatorio = {
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      data: new Date().toLocaleDateString('pt-BR'),
      valorInicial: ini,
      valorFinal: isNaN(fin) ? null : fin,
      diferenca: isNaN(fin) ? null : fin - esperado,
      porPagamento: { ...porPag },
      totalBalcao,
      totalSite,
      totalDia,
      qtdVendas: vendasDia.length,
    }
    setCaixaFechado(relatorio)
    localStorage.setItem(keyFechado, JSON.stringify(relatorio))
  }

  function reabrirCaixa() {
    if (!window.confirm('Reabrir caixa? O relatório de fechamento será removido.')) return
    setCaixaFechado(null)
    localStorage.removeItem(keyFechado)
  }

  function abrirEdicao(venda) {
    setEditandoId(venda.id)
    setEditItens(parseItens(venda.itens).map((it, i) => ({ ...it, _key: i })))
    setEditPag(venda.pagamento || '')
  }

  function fecharEdicao() {
    setEditandoId(null)
    setEditItens([])
    setEditPag('')
  }

  function editarQtdItem(idx, delta) {
    setEditItens(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const novaQtd = Math.max(0, (it.qtd || 1) + delta)
      return { ...it, qtd: novaQtd }
    }).filter(it => (it.qtd || 1) > 0))
  }

  function removerItem(idx) {
    setEditItens(prev => prev.filter((_, i) => i !== idx))
  }

  function adicionarItemManual() {
    const nome = window.prompt('Nome do item:')
    if (!nome) return
    const precoStr = window.prompt('Preço unitário (ex: 12.00):')
    const preco = parseFloat(precoStr)
    if (isNaN(preco)) return
    setEditItens(prev => [...prev, { nome, preco, qtd: 1, _key: Date.now() }])
  }

  async function salvarEdicao(vendaId) {
    setSalvando(true)
    const novoTotal = somarCart(editItens)
    const itensLimpos = editItens.map(({ _key, ...rest }) => rest)
    await onSalvarPedido(vendaId, {
      itens: itensLimpos,
      total: novoTotal,
      subtotal: novoTotal,
      pagamento: editPag,
    })
    setSalvando(false)
    fecharEdicao()
  }

  // Dados gráfico por hora
  const dadosHora = Array.from({ length: 24 }, (_, h) => {
    const total = pedidosHoje
      .filter(p => new Date(p.created_at).getHours() === h)
      .reduce((acc, p) => acc + Number(p.total || 0), 0)
    return { hora: `${String(h).padStart(2, '0')}h`, total }
  })

  // Produtos mais vendidos
  const produtosCount = {}
  pedidosHoje.forEach(p => {
    parseItens(p.itens).forEach(item => {
      const key = item.nome || 'Item'
      produtosCount[key] = (produtosCount[key] || 0) + (item.qtd || item.quantidade || 1)
    })
  })
  const topProdutos = Object.entries(produtosCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([nome, qtd]) => ({ nome: nome.length > 16 ? nome.slice(0, 14) + '…' : nome, qtd }))

  // Split por pagamento
  const pagCount = {}
  pedidosHoje.forEach(p => {
    const k = (p.pagamento || 'outro').toLowerCase()
    pagCount[k] = (pagCount[k] || 0) + Number(p.total || 0)
  })
  const CORES_PAG = ['#E53935', '#F5C800', '#00c853', '#2196F3', '#9C27B0']
  const dadosPag = Object.entries(pagCount).map(([name, value], i) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: parseFloat(value.toFixed(2)),
    cor: CORES_PAG[i % CORES_PAG.length],
  }))

  const ultimos5 = [...pedidos].reverse().slice(0, 5)

  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
  }

  // Fluxo de caixa — usa todos os pedidos carregados (já filtrados por data externamente)
  const vendasDia = pedidos
    .filter(p => p.status === 'entregue')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const totalSite = vendasDia.filter(v => v.origem !== 'balcao' && v.pagamento !== 'caderneta').reduce((s, p) => s + Number(p.total || 0), 0)
  const totalBalcao = vendasDia.filter(v => v.origem === 'balcao' && v.pagamento !== 'caderneta').reduce((s, p) => s + Number(p.total || 0), 0)
  const totalCadernetaDia = vendasDia.filter(p => p.pagamento === 'caderneta').reduce((s, p) => s + Number(p.total || 0), 0)
  const totalDia = vendasDia.reduce((s, p) => s + Number(p.total || 0), 0) - totalCadernetaDia * 2

  const porPag = {}
  vendasDia.forEach(p => {
    const k = (p.pagamento || 'outro')
    porPag[k] = (porPag[k] || 0) + Number(p.total || 0)
  })

  const FORMAS_PAG = ['pix', 'dinheiro', 'debito', 'credito', 'caderneta']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ══ FLUXO DE CAIXA — TOPO ══ */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '1.05rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Vendas Finalizadas
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#FF7777', fontSize: '0.78rem', fontWeight: 700 }}>Site: {fmtMoeda(totalSite)}</span>
            <span style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 700 }}>Balcão: {fmtMoeda(totalBalcao)}</span>
            <span style={{ color: C.success, fontSize: '0.95rem', fontWeight: 900, background: 'rgba(0,230,118,0.1)', padding: '2px 10px', borderRadius: '8px', border: '1px solid rgba(0,230,118,0.25)' }}>
              TOTAL: {fmtMoeda(totalDia)}
            </span>
          </div>
        </div>

        {/* Filtro de período */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
          {[['hoje','Hoje'],['ontem','Ontem'],['semana','7 dias'],['mes','Este Mês']].map(([p, label]) => (
            <button
              key={p}
              onClick={() => mudarPeriodoFluxo(p)}
              style={{
                padding: '4px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 700,
                background: periodoFluxo === p ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.75)',
                color: periodoFluxo === p ? '#fff' : C.muted,
              }}
            >{label}</button>
          ))}
          <input
            type="date"
            value={periodoFluxo === 'custom' ? dataCustomFluxo : ''}
            onChange={e => mudarDataCustomFluxo(e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: '8px', fontSize: '0.75rem',
              background: periodoFluxo === 'custom' ? 'rgba(229,57,53,0.15)' : 'rgba(255,235,235,0.70)',
              border: `1px solid ${periodoFluxo === 'custom' ? 'rgba(229,57,53,0.4)' : C.cardBorder}`,
              color: C.text, outline: 'none', cursor: 'pointer',
            }}
          />
        </div>

        {/* Resumo por pagamento */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {Object.entries(porPag).map(([pag, val]) => {
            const isCaderneta = pag === 'caderneta'
            return (
              <div key={pag} style={{
                background: isCaderneta ? 'rgba(239,68,68,0.10)' : 'rgba(255,235,235,0.70)',
                border: isCaderneta ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '0.5rem 0.875rem', textAlign: 'center',
              }}>
                <div style={{ color: isCaderneta ? '#ef4444' : 'rgba(15,0,0,0.82)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  {isCaderneta ? '📒 caderneta' : pag}
                </div>
                <div style={{ color: isCaderneta ? '#dc2626' : '#1A0000', fontSize: '1rem', fontWeight: 900 }}>
                  {isCaderneta ? `-${fmtMoeda(val)}` : fmtMoeda(val)}
                </div>
                {isCaderneta && <div style={{ color: '#ef4444', fontSize: '0.58rem', fontWeight: 600 }}>a receber</div>}
              </div>
            )
          })}
        </div>

        {/* Tabela de vendas */}
        {vendasDia.length === 0 ? (
          <p style={{ color: C.muted, textAlign: 'center', padding: '1.5rem 0', fontSize: '0.85rem' }}>Nenhuma venda finalizada hoje</p>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['Hora', 'Origem', '#', 'Cliente', 'Itens', 'Pagamento', 'Valor', 'Desconto', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '0.55rem 0.75rem', color: 'rgba(15,0,0,0.82)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'rgba(255,240,240,0.95)', zIndex: 1 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendasDia.map(v => {
                  const itensV = parseItens(v.itens)
                  const resumoV = itensV.map(i => `${i.qtd || 1}x ${i.nome}`).join(', ')
                  const ehBalcao = v.origem === 'balcao'
                  const editando = editandoId === v.id
                  return (
                    <Fragment key={v.id}>
                      <tr style={{ borderBottom: editando ? 'none' : '1px solid rgba(255,255,255,0.05)', background: editando ? 'rgba(245,200,0,0.05)' : 'transparent' }}>
                        <td style={{ padding: '0.5rem 0.75rem', color: C.gold, fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {fmtHora(v.created_at)}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                            background: ehBalcao ? 'rgba(245,200,0,0.15)' : 'rgba(229,57,53,0.15)',
                            color: ehBalcao ? C.gold : '#FF7777',
                            border: `1px solid ${ehBalcao ? 'rgba(245,200,0,0.3)' : 'rgba(229,57,53,0.3)'}`,
                          }}>
                            {ehBalcao ? 'Balcão' : 'Site'}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'rgba(15,0,0,0.82)', fontSize: '0.78rem' }}>
                          {v.numero}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#1A0000', fontSize: '0.82rem', fontWeight: 600, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.nome}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: 'rgba(15,0,0,0.85)', fontSize: '0.78rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {resumoV}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <BadgePagamento pag={v.pagamento} />
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: v.pagamento === 'caderneta' ? '#ef4444' : C.success, fontSize: '0.88rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
                          {v.pagamento === 'caderneta' ? `-${fmtMoeda(v.total)}` : fmtMoeda(v.total)}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {Number(v.desconto_valor) > 0 ? (
                            <div title={v.desconto_obs || ''}>
                              <span style={{ color: '#ff6b6b', fontWeight: 700 }}>-{fmtMoeda(v.desconto_valor)}</span>
                              {v.desconto_obs && <div style={{ color: C.muted, fontSize: '0.65rem', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.desconto_obs}</div>}
                            </div>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => onImprimir && onImprimir(v)}
                              title="Imprimir comprovante"
                              style={{
                                background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
                                borderRadius: '8px', width: '30px', height: '28px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: C.text,
                              }}
                            >
                              <Printer size={14} />
                            </button>
                            <button
                              onClick={() => editando ? fecharEdicao() : abrirEdicao(v)}
                              title={editando ? 'Cancelar edição' : 'Editar venda'}
                              style={{
                                background: editando ? 'rgba(255,255,255,0.1)' : 'rgba(245,200,0,0.12)',
                                border: `1px solid ${editando ? 'rgba(255,255,255,0.2)' : 'rgba(245,200,0,0.3)'}`,
                                borderRadius: '8px', width: '30px', height: '28px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: editando ? '#fff' : C.gold,
                              }}
                            >
                              {editando ? <X size={14} /> : <Pencil size={14} />}
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Excluir venda #${v.numero} de ${v.nome}?`)) onExcluir(v.id, true)
                              }}
                              title="Excluir venda"
                              style={{
                                background: 'rgba(255,82,82,0.12)', border: '1px solid rgba(255,82,82,0.3)',
                                borderRadius: '8px', width: '30px', height: '28px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: '#FF5252',
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Painel de edição expandido */}
                      {editando && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0 0.75rem 0.75rem', background: 'rgba(245,200,0,0.04)', borderBottom: '1px solid rgba(245,200,0,0.15)' }}>
                            <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <span style={{ color: '#1A0000', fontWeight: 800, fontSize: '0.85rem' }}>Editando venda #{v.numero}</span>
                                <button
                                  onClick={adicionarItemManual}
                                  style={{
                                    background: 'rgba(0,230,118,0.12)', border: '1px solid rgba(0,230,118,0.3)',
                                    borderRadius: '8px', padding: '4px 12px', cursor: 'pointer',
                                    color: C.success, fontSize: '0.75rem', fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                  }}
                                >
                                  <Plus size={14} /> Adicionar item
                                </button>
                              </div>

                              {/* Lista de itens editáveis */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '0.75rem' }}>
                                {editItens.map((it, idx) => (
                                  <div key={it._key ?? idx} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 10px', borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                                  }}>
                                    <span style={{ color: '#1A0000', fontSize: '0.8rem', flex: 1 }}>{it.nome}</span>
                                    <span style={{ color: C.muted, fontSize: '0.75rem' }}>{fmtMoeda(it.preco || 0)}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255,235,235,0.75)', borderRadius: '6px', padding: '1px 2px' }}>
                                      <button onClick={() => editarQtdItem(idx, -1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF7777', fontSize: '0.9rem', fontWeight: 900, width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                      <span style={{ color: '#1A0000', fontWeight: 900, fontSize: '0.82rem', minWidth: '18px', textAlign: 'center' }}>{it.qtd || 1}</span>
                                      <button onClick={() => editarQtdItem(idx, 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A0000', fontSize: '0.9rem', fontWeight: 900, width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                    </div>
                                    <span style={{ color: C.gold, fontWeight: 800, fontSize: '0.8rem', minWidth: '55px', textAlign: 'right' }}>
                                      {fmtMoeda((it.preco || 0) * (it.qtd || 1))}
                                    </span>
                                    <button onClick={() => removerItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5252', display: 'flex', alignItems: 'center' }}>
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              {/* Forma de pagamento */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <span style={{ color: C.muted, fontSize: '0.75rem', fontWeight: 700 }}>Pagamento:</span>
                                {FORMAS_PAG.map(f => (
                                  <button
                                    key={f}
                                    onClick={() => setEditPag(f)}
                                    style={{
                                      padding: '4px 12px', borderRadius: '8px', fontSize: '0.73rem', fontWeight: 700,
                                      cursor: 'pointer',
                                      background: editPag === f ? 'rgba(245,200,0,0.2)' : 'rgba(255,235,235,0.70)',
                                      border: `1px solid ${editPag === f ? 'rgba(245,200,0,0.4)' : 'rgba(255,235,235,0.78)'}`,
                                      color: editPag === f ? C.gold : 'rgba(255,255,255,0.7)',
                                    }}
                                  >
                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                  </button>
                                ))}
                              </div>

                              {/* Novo total + Salvar */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ color: C.success, fontWeight: 900, fontSize: '1rem' }}>
                                  Novo total: {fmtMoeda(editItens.reduce((s, it) => s + (it.preco || 0) * (it.qtd || 1), 0))}
                                </span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={fecharEdicao} style={{
                                    padding: '6px 16px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700,
                                    background: 'rgba(255,235,235,0.75)', border: '1px solid rgba(255,255,255,0.15)',
                                    color: '#1A0000', cursor: 'pointer',
                                  }}>
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => salvarEdicao(v.id)}
                                    disabled={salvando || editItens.length === 0}
                                    style={{
                                      padding: '6px 20px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700,
                                      background: salvando ? 'rgba(0,230,118,0.1)' : 'rgba(0,230,118,0.2)',
                                      border: '1px solid rgba(0,230,118,0.4)',
                                      color: C.success, cursor: salvando ? 'wait' : 'pointer',
                                      display: 'flex', alignItems: 'center', gap: '4px',
                                      opacity: editItens.length === 0 ? 0.4 : 1,
                                    }}
                                  >
                                    <Check size={14} /> {salvando ? 'Salvando...' : 'Salvar'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ CONFERÊNCIA DE CAIXA ══ */}
      <div style={{
        ...cardStyle,
        border: caixaFechado
          ? '1px solid rgba(0,230,118,0.35)'
          : conferenciAberta ? '1px solid rgba(245,200,0,0.35)' : `1px solid ${C.cardBorder}`,
      }}>
        {/* Header clicável */}
        <button
          onClick={() => setConferenciaAberta(v => !v)}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.1rem' }}>🏧</span>
            <span style={{ color: C.text, fontWeight: 800, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Conferência de Caixa
            </span>
            {caixaFechado && (
              <span style={{ background: 'rgba(0,230,118,0.15)', border: '1px solid rgba(0,230,118,0.35)', borderRadius: '20px', padding: '2px 10px', color: C.success, fontSize: '0.7rem', fontWeight: 700 }}>
                FECHADO {caixaFechado.hora}
              </span>
            )}
          </div>
          <span style={{ color: C.muted, fontSize: '0.85rem' }}>{conferenciAberta ? '▲' : '▼'}</span>
        </button>

        {conferenciAberta && (
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Valor inicial + final */}
            {!caixaFechado && (
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <p style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 0.4rem' }}>
                    Valor inicial (troco)
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: C.muted, fontSize: '0.85rem' }}>R$</span>
                    <input
                      type="number"
                      value={valorInicial}
                      onChange={e => salvarValorInicial(e.target.value)}
                      placeholder="0,00"
                      min="0" step="0.01"
                      style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: 10, background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text, fontSize: '0.95rem', fontWeight: 700, outline: 'none' }}
                    />
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <p style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 0.4rem' }}>
                    Valor final (contagem)
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: C.muted, fontSize: '0.85rem' }}>R$</span>
                    <input
                      type="number"
                      value={valorFinal}
                      onChange={e => salvarValorFinal(e.target.value)}
                      placeholder="0,00"
                      min="0" step="0.01"
                      style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: 10, background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text, fontSize: '0.95rem', fontWeight: 700, outline: 'none' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Resumo por pagamento */}
            <div>
              <p style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 0.5rem' }}>
                Vendas do dia por forma de pagamento
              </p>
              {Object.keys(caixaFechado ? caixaFechado.porPagamento : porPag).length === 0 ? (
                <p style={{ color: C.muted, fontSize: '0.82rem', fontStyle: 'italic' }}>Nenhuma venda registrada ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.entries(caixaFechado ? caixaFechado.porPagamento : porPag).map(([pag, val]) => {
                    const isDinheiro = pag === 'dinheiro'
                    return (
                      <div key={pag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: 10, background: isDinheiro ? 'rgba(0,200,80,0.07)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isDinheiro ? 'rgba(0,200,80,0.2)' : C.cardBorder}` }}>
                        <span style={{ color: C.text, fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>{pag}</span>
                        <span style={{ color: isDinheiro ? C.success : C.gold, fontWeight: 900, fontSize: '0.95rem' }}>{fmtMoeda(val)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Totais */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.cardBorder}`, textAlign: 'center' }}>
                <div style={{ color: C.muted, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Balcão</div>
                <div style={{ color: C.gold, fontWeight: 900, fontSize: '1rem' }}>{fmtMoeda(caixaFechado ? caixaFechado.totalBalcao : totalBalcao)}</div>
              </div>
              <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.cardBorder}`, textAlign: 'center' }}>
                <div style={{ color: C.muted, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Site / App</div>
                <div style={{ color: '#FF7777', fontWeight: 900, fontSize: '1rem' }}>{fmtMoeda(caixaFechado ? caixaFechado.totalSite : totalSite)}</div>
              </div>
            </div>

            {/* Dinheiro esperado + diferença */}
            {(() => {
              const ini = parseFloat((caixaFechado ? caixaFechado.valorInicial : valorInicial) || 0)
              const fin = parseFloat((caixaFechado ? caixaFechado.valorFinal : valorFinal) || '')
              const vendDinheiro = (caixaFechado ? caixaFechado.porPagamento : porPag)['dinheiro'] || 0
              const esperado = ini + vendDinheiro
              const temFinal = !isNaN(fin) && valorFinal !== '' || (caixaFechado?.valorFinal != null)
              const diferenca = temFinal ? fin - esperado : null
              const sobrou = diferenca > 0
              const zerou  = diferenca === 0

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ padding: '0.875rem 1rem', borderRadius: 12, background: 'rgba(0,200,80,0.08)', border: '1px solid rgba(0,200,80,0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: ini > 0 ? 4 : 0 }}>
                      <span style={{ color: C.text, fontSize: '0.85rem', fontWeight: 700 }}>💵 Esperado no caixa</span>
                      <span style={{ color: C.success, fontWeight: 900, fontSize: '1.1rem' }}>{fmtMoeda(esperado)}</span>
                    </div>
                    {ini > 0 && (
                      <div style={{ color: C.muted, fontSize: '0.72rem' }}>
                        Troco inicial {fmtMoeda(ini)} + dinheiro vendas {fmtMoeda(vendDinheiro)}
                      </div>
                    )}
                  </div>

                  {temFinal && diferenca !== null && (
                    <div style={{
                      padding: '0.875rem 1rem', borderRadius: 12,
                      background: zerou ? 'rgba(0,200,80,0.08)' : sobrou ? 'rgba(33,150,243,0.1)' : 'rgba(255,82,82,0.1)',
                      border: `1px solid ${zerou ? 'rgba(0,200,80,0.3)' : sobrou ? 'rgba(33,150,243,0.35)' : 'rgba(255,82,82,0.35)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ color: C.text, fontSize: '0.85rem', fontWeight: 700 }}>
                          {zerou ? '✅ Caixa fechou certinho' : sobrou ? '📈 Sobrou no caixa' : '⚠️ Faltou no caixa'}
                        </span>
                        <span style={{
                          fontWeight: 900, fontSize: '1.1rem',
                          color: zerou ? C.success : sobrou ? '#64b5f6' : C.danger,
                        }}>
                          {zerou ? '—' : `${sobrou ? '+' : '-'} ${fmtMoeda(Math.abs(diferenca))}`}
                        </span>
                      </div>
                      <div style={{ color: C.muted, fontSize: '0.72rem' }}>
                        Contado {fmtMoeda(fin)} · Esperado {fmtMoeda(esperado)}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Total geral */}
            <div style={{ padding: '0.875rem 1rem', borderRadius: 12, background: 'rgba(245,200,0,0.08)', border: '1px solid rgba(245,200,0,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: C.text, fontWeight: 800, fontSize: '0.9rem' }}>Total geral do dia</div>
                <div style={{ color: C.muted, fontSize: '0.72rem' }}>{(caixaFechado ? caixaFechado.qtdVendas : vendasDia.length)} vendas finalizadas</div>
              </div>
              <span style={{ color: C.gold, fontWeight: 900, fontSize: '1.3rem' }}>{fmtMoeda(caixaFechado ? caixaFechado.totalDia : totalDia)}</span>
            </div>

            {/* Botão fechar / reabrir */}
            {caixaFechado ? (
              <button
                onClick={reabrirCaixa}
                style={{ padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(255,82,82,0.3)', background: 'rgba(255,82,82,0.1)', color: '#FF5252', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Reabrir Caixa
              </button>
            ) : (
              <button
                onClick={fecharCaixa}
                style={{ padding: '0.7rem', borderRadius: 10, border: 'none', background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(229,57,53,0.35)' }}
              >
                🔒 Fechar Caixa
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
        <KpiCard icon={DollarSign} label="Faturamento Hoje" valor={fmtMoeda(faturamentoHoje)} sub={`${pedidosHoje.length} pedidos`} corSub={C.muted} />
        <KpiCard icon={Package} label="Pedidos Hoje" valor={pedidosHoje.length} sub="total do dia" />
        <KpiCard icon={TrendingUp} label="Ticket Medio" valor={fmtMoeda(ticketMedio)} sub="por pedido" />
        <KpiCard icon={Clock} label="Pendentes" valor={pendentes} sub={pendentes > 0 ? 'aguardando' : 'tudo em dia'} corSub={pendentes > 0 ? C.danger : C.success} />
        {totalDescontosHoje > 0 && (
          <KpiCard icon={Tag} label="Descontos Hoje" valor={`- ${fmtMoeda(totalDescontosHoje)}`} sub={`${descontosHoje.length} desconto${descontosHoje.length !== 1 ? 's' : ''}`} corSub="#ff6b6b" />
        )}
      </div>

      {/* Graficos linha 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1rem' }}>

        {/* Vendas por Hora */}
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Vendas por Hora
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dadosHora} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E53935" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#E53935" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="hora" tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="total" stroke="#E53935" strokeWidth={2} fill="url(#gradRed)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Produtos mais vendidos */}
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Produtos mais Vendidos
          </h3>
          {topProdutos.length === 0 ? (
            <p style={{ color: C.muted, textAlign: 'center', padding: '2rem 0', fontSize: '0.82rem' }}>Sem dados hoje</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProdutos} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradBar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#E53935" />
                    <stop offset="100%" stopColor="#F5C800" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="nome" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                <Tooltip content={<CustomTooltipCount />} />
                <Bar dataKey="qtd" fill="url(#gradBar)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Graficos linha 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>

        {/* Split pagamento */}
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Por Pagamento
          </h3>
          {dadosPag.length === 0 ? (
            <p style={{ color: C.muted, textAlign: 'center', padding: '2rem 0', fontSize: '0.82rem' }}>Sem dados hoje</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={dadosPag} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={3}>
                    {dadosPag.map((entry, i) => <Cell key={i} fill={entry.cor} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoeda(v)} contentStyle={{ background: 'rgba(255,240,240,0.97)', border: '1px solid rgba(198,40,40,0.3)', borderRadius: '10px', color: '#1A0000' }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'center' }}>
                {dadosPag.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: d.cor }} />
                    <span style={{ color: C.muted }}>{d.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Ultimos 5 pedidos */}
        <div style={{ ...cardStyle, gridColumn: 'span 1' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Ultimos Pedidos
            </h3>
            <button
              onClick={onVerPedidos}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF7777', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'underline' }}
            >
              Ver todos
            </button>
          </div>
          {ultimos5.length === 0 ? (
            <p style={{ color: C.muted, textAlign: 'center', padding: '1rem 0', fontSize: '0.82rem' }}>Sem pedidos</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {ultimos5.map(p => (
                <div
                  key={p.id}
                  onClick={onVerPedidos}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 8px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span style={{ color: C.muted, fontSize: '0.68rem', minWidth: '48px' }}>#{p.numero}</span>
                  <span style={{ color: C.text, fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                  <span style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoeda(p.total)}</span>
                  <BadgeStatus status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA 2: PEDIDOS (Live)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _LinhaPedido_UNUSED({ pedido, selecionado, onClick }) {
  const itens = parseItens(pedido.itens)
  const resumo = itens.map(i => `${i.qtd || 1}x ${i.nome}`).join(' + ').slice(0, 45) + (itens.join('+').length > 45 ? '…' : '')
  return (
    <tr
      onClick={onClick}
      style={{
        cursor: 'pointer',
        background: selecionado ? 'rgba(229,57,53,0.12)' : 'transparent',
        borderLeft: selecionado ? `3px solid ${C.red}` : '3px solid transparent',
        transition: 'background 0.15s',
      }}
    >
      <td style={{ padding: '0.6rem 0.75rem', color: C.text, fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
        #{pedido.numero}
      </td>
      <td style={{ padding: '0.6rem 0.75rem' }}>
        <div style={{ color: C.text, fontSize: '0.8rem', fontWeight: 600 }}>{pedido.nome}</div>
        <div style={{ color: C.muted, fontSize: '0.68rem' }}>{pedido.telefone}</div>
      </td>
      <td style={{ padding: '0.6rem 0.75rem', color: C.muted, fontSize: '0.72rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {resumo}
      </td>
      <td style={{ padding: '0.6rem 0.75rem', color: C.gold, fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
        {fmtMoeda(pedido.total)}
      </td>
      <td style={{ padding: '0.6rem 0.75rem' }}><BadgePagamento pag={pedido.pagamento} /></td>
      <td style={{ padding: '0.6rem 0.75rem' }}><BadgeStatus status={pedido.status} /></td>
      <td style={{ padding: '0.6rem 0.75rem' }}><TimerBadge createdAt={pedido.created_at} /></td>
    </tr>
  )
}

function PainelDetalhe({ pedido, onStatus, onImprimir, onExcluir, onFechar }) {
  const min = useTimer(pedido?.created_at)
  if (!pedido) {
    return (
      <div style={{
        background: C.card, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: '16px', padding: '2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '320px',
      }}>
        <p style={{ color: C.muted, fontSize: '0.88rem', textAlign: 'center' }}>
          Selecione um pedido para ver os detalhes
        </p>
      </div>
    )
  }

  const info = STATUS_FLOW[pedido.status] || STATUS_FLOW.recebido
  const itens = parseItens(pedido.itens)
  const corTempo = min < 10 ? C.success : min < 20 ? C.warning : C.danger
  const pulsando = min >= 20

  return (
    <div style={{
      background: C.card, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: `2px solid ${corTempo}${pulsando ? 'cc' : '44'}`, borderRadius: '16px',
      animation: pulsando ? 'pulseBorder 1.5s ease-in-out infinite' : 'none',
      overflow: 'hidden',
    }}>
      {/* Cabecalho detalhe */}
      <div style={{
        background: `linear-gradient(145deg, ${info.cor}22, ${info.cor}0a)`,
        borderBottom: `1px solid ${info.cor}33`,
        padding: '1rem 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ color: C.text, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', letterSpacing: '2px' }}>
            Pedido #{pedido.numero}
          </span>
          <div style={{ color: C.muted, fontSize: '0.72rem', marginTop: '2px' }}>
            {fmtHora(pedido.created_at)} · {pedido.nome} · {pedido.telefone}
          </div>
        </div>
        <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px' }}>
          <X size={18} />
        </button>
      </div>

      {/* Timer grande */}
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}`, display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          fontFamily: 'Bebas Neue, sans-serif', fontSize: '3rem', color: corTempo,
          lineHeight: 1, textShadow: `0 0 20px ${corTempo}66`,
        }}>
          {min}min
        </div>
        <div>
          <BadgeStatus status={pedido.status} />
          <div style={{ color: C.muted, fontSize: '0.7rem', marginTop: '4px' }}>
            <BadgePagamento pag={pedido.pagamento} />
          </div>
        </div>
        <div style={{ marginLeft: 'auto', color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem' }}>
          {fmtMoeda(pedido.total)}
        </div>
      </div>

      {/* Endereço / tipo de entrega */}
      {(() => {
        const end = pedido.endereco
        const isEntrega = pedido.tipo_entrega === 'entrega' && end
        return isEntrega ? (
          <div style={{
            padding: '0.75rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}`,
            background: 'rgba(0,160,100,0.08)',
            display: 'flex', alignItems: 'flex-start', gap: '8px',
          }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🛵</span>
            <div>
              <div style={{ color: '#5dff9a', fontWeight: 700, fontSize: '0.78rem', marginBottom: '2px' }}>ENTREGA</div>
              <div style={{ color: C.text, fontSize: '0.82rem', fontWeight: 600 }}>
                {end.rua}, {end.numero}{end.complemento ? ` — ${end.complemento}` : ''}
              </div>
              <div style={{ color: C.muted, fontSize: '0.75rem' }}>
                {end.bairro}{end.referencia ? ` · Ref: ${end.referencia}` : ''}
              </div>
              {pedido.taxa_entrega > 0 && (
                <div style={{ color: C.gold, fontSize: '0.72rem', marginTop: '2px', fontWeight: 700 }}>
                  Taxa: {fmtMoeda(pedido.taxa_entrega)}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            padding: '0.5rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}`,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ fontSize: '0.9rem' }}>🏪</span>
            <span style={{ color: C.muted, fontSize: '0.75rem' }}>Retirada na loja</span>
          </div>
        )
      })()}

      {/* Itens */}
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}`, maxHeight: '280px', overflowY: 'auto' }}>
        {itens.map((item, i) => (
          <div key={i} style={{ padding: '6px 0', borderBottom: i < itens.length - 1 ? `1px solid ${C.cardBorder}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.text, fontWeight: 700, fontSize: '0.88rem' }}>
                {item.qtd || item.quantidade || 1}x {item.nome}
              </span>
              <span style={{ color: C.gold, fontSize: '0.82rem', fontWeight: 700 }}>
                {fmtMoeda((item.preco || 0) * (item.qtd || item.quantidade || 1))}
              </span>
            </div>
            {item.sabores?.length > 0 && (
              <div style={{ color: 'rgba(15,0,0,0.82)', fontSize: '0.72rem', marginTop: '2px' }}>
                Sabores: {item.sabores.join(', ')}
              </div>
            )}
            {item.adicionais?.length > 0 && (
              <div style={{ color: 'rgba(245,200,0,0.65)', fontSize: '0.72rem', marginTop: '2px' }}>
                Adicionais: {item.adicionais.join(', ')}
              </div>
            )}
            {item.observacao && (
              <div style={{ color: C.muted, fontSize: '0.7rem', fontStyle: 'italic', marginTop: '2px' }}>{item.observacao}</div>
            )}
          </div>
        ))}
      </div>

      {/* Acoes */}
      <div style={{ padding: '0.875rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {info.anterior && (
          <button
            onClick={() => onStatus(pedido.id, info.anterior)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '0.6rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.82rem',
              background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.muted,
            }}
          >
            <ChevronLeft size={14} /> Retroceder
          </button>
        )}
        {info.proximo && (
          <button
            onClick={() => onStatus(pedido.id, info.proximo)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '0.6rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700,
              background: `linear-gradient(145deg, ${info.cor}, ${info.cor}bb)`,
              border: 'none', color: '#fff',
              boxShadow: `0 4px 14px ${info.cor}44`,
            }}
          >
            {info.rotulo} <ChevronRight size={14} />
          </button>
        )}
        <button
          onClick={() => onImprimir(pedido)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0.6rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.82rem',
            background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text,
          }}
        >
          <Printer size={14} /> Imprimir
        </button>
        <button
          onClick={() => onExcluir(pedido.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0.6rem 0.875rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.78rem',
            background: 'rgba(200,0,0,0.12)', border: '1px solid rgba(200,0,0,0.3)', color: '#ff7777',
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function CardPedido({ pedido, expandido, onToggle, onStatus, onImprimir, onExcluir, isNovo, onFinalizar }) {
  const info = STATUS_FLOW[pedido.status] || STATUS_FLOW.recebido
  const itens = parseItens(pedido.itens)
  const resumo = itens.slice(0, 3).map(i => `${i.qtd || 1}x ${i.nome}`).join(' + ')
  const tel = pedido.telefone?.replace(/\D/g, '')
  const cardRef = useRef(null)

  const corCard = isNovo ? '#2196F3' : info.cor

  function handleToggle() {
    onToggle()
    if (!expandido && cardRef.current) {
      setTimeout(() => cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }

  return (
    <div ref={cardRef} style={{
      position: 'relative',
      zIndex: expandido ? 10 : 1,
      background: isNovo
        ? 'linear-gradient(135deg, rgba(33,150,243,0.18), rgba(220,240,255,0.92))'
        : 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: expandido ? `2px solid rgba(245,200,0,0.6)` : `1.5px solid ${isNovo ? 'rgba(33,150,243,0.50)' : C.cardBorder}`,
      borderLeft: `4px solid ${corCard}`,
      borderRadius: '14px', overflow: expandido ? 'visible' : 'hidden',
      animation: isNovo ? 'novoPedidoPulse 1.5s ease-in-out infinite' : 'none',
      boxShadow: expandido ? '0 6px 28px rgba(100,0,0,0.22)' : (isNovo ? '0 0 16px rgba(33,150,243,0.30), 0 2px 8px rgba(0,0,100,0.12)' : '0 2px 10px rgba(120,0,0,0.13), 0 1px 3px rgba(120,0,0,0.07)'),
    }}>
      {/* Linha compacta */}
      <div
        onClick={handleToggle}
        style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1.125rem', cursor: 'pointer', flexWrap: 'wrap' }}
      >
        <div style={{ minWidth: '85px' }}>
          <div style={{ color: C.gold, fontSize: '1.15rem', fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '1px' }}>
            {fmtHora(pedido.created_at)}
          </div>
          <div style={{ color: 'rgba(15,0,0,0.85)', fontSize: '1rem', fontWeight: 700 }}>#{pedido.numero}</div>
        </div>
        <div style={{ flex: 1, minWidth: '120px', overflow: 'hidden' }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pedido.nome}
          </div>
          <div style={{ color: 'rgba(15,0,0,0.85)', fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {resumo}
          </div>
        </div>
        <div style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.4rem', letterSpacing: '1px', flexShrink: 0 }}>
          {fmtMoeda(pedido.total)}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          <BadgePagamento pag={pedido.pagamento} />
          <BadgeStatus status={pedido.status} />
          <TimerBadge createdAt={pedido.created_at} />
        </div>
        {tel && (
          <a
            href={`https://wa.me/${tel}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.3)', textDecoration: 'none', fontSize: '1.05rem', flexShrink: 0 }}
          >💬</a>
        )}
        <ChevronRight size={18} color={C.muted} style={{ transform: expandido ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </div>

      {/* Detalhe expandido */}
      {expandido && (
        <div style={{ borderTop: `1px solid ${C.cardBorder}`, display: 'flex', flexDirection: 'column', maxHeight: '65vh' }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ padding: '0.875rem 1.125rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {itens.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ color: C.text, fontWeight: 700, fontSize: '1.15rem' }}>{item.qtd || 1}x {item.nome}</span>
                  {item.sabores?.length > 0 && (
                    <div style={{ color: 'rgba(15,0,0,0.85)', fontSize: '1.1rem', fontWeight: 600, marginTop: '3px' }}>Sabores: {item.sabores.join(', ')}</div>
                  )}
                  {item.adicionais?.length > 0 && (
                    <div style={{ color: 'rgba(245,200,0,0.85)', fontSize: '1.05rem', fontWeight: 600, marginTop: '2px' }}>+ {item.adicionais.join(', ')}</div>
                  )}
                  {item.observacao && (
                    <div style={{ color: C.muted, fontSize: '1rem', fontStyle: 'italic', marginTop: '3px' }}>📝 {item.observacao}</div>
                  )}
                </div>
                <span style={{ color: C.gold, fontWeight: 700, fontSize: '1.05rem', flexShrink: 0, marginLeft: '10px' }}>
                  {fmtMoeda((item.preco || 0) * (item.qtd || 1))}
                </span>
              </div>
            ))}
          </div>
          {/* Info entrega/endereço */}
          {pedido.tipo_entrega === 'entrega' && pedido.endereco && (
            <div style={{ padding: '0.625rem 1.125rem', borderTop: `1px solid ${C.cardBorder}`, background: 'rgba(245,200,0,0.05)' }}>
              <span style={{ color: C.gold, fontSize: '1rem', fontWeight: 700 }}>🛵 Entrega:</span>
              <span style={{ color: 'rgba(15,0,0,0.85)', fontSize: '0.95rem', marginLeft: '6px' }}>{pedido.endereco}</span>
            </div>
          )}
          {pedido.observacao && (
            <div style={{ padding: '0.625rem 1.125rem', borderTop: `1px solid ${C.cardBorder}`, background: 'rgba(255,235,235,0.40)' }}>
              <span style={{ color: C.muted, fontSize: '0.95rem', fontStyle: 'italic' }}>📝 {pedido.observacao}</span>
            </div>
          )}
          {/* Pagamento + Troco */}
          <div style={{ padding: '0.625rem 1.125rem', borderTop: `1px solid ${C.cardBorder}`, display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: C.text, fontSize: '1rem', fontWeight: 700 }}>💳 {pedido.pagamento?.toUpperCase()}</span>
            {pedido.pagamento === 'dinheiro' && pedido.troco > 0 && (() => {
              const trocoDevolver = Number(pedido.troco) - Number(pedido.total)
              return (
                <>
                  <span style={{ color: C.muted, fontSize: '0.92rem' }}>Paga com: {fmtMoeda(pedido.troco)}</span>
                  {trocoDevolver > 0 && (
                    <span style={{ color: '#6aff9e', fontSize: '1.05rem', fontWeight: 700, background: 'rgba(0,200,80,0.12)', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(0,200,80,0.3)' }}>
                      TROCO: {fmtMoeda(trocoDevolver)}
                    </span>
                  )}
                </>
              )
            })()}
          </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '0.75rem 1.125rem', borderTop: `1px solid ${C.cardBorder}`, background: 'rgba(0,0,0,0.2)', flexShrink: 0, borderRadius: '0 0 12px 12px' }}>
            {info.anterior && (
              <button onClick={() => onStatus(pedido.id, info.anterior)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.625rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.92rem', background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.muted }}>
                <ChevronLeft size={15} /> Retroceder
              </button>
            )}
            {info.proximo && pedido.status !== 'pronto' && (
              <button onClick={() => onStatus(pedido.id, info.proximo)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.7rem 1.125rem', borderRadius: '10px', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, background: `linear-gradient(145deg,${info.cor},${info.cor}bb)`, border: 'none', color: '#fff', boxShadow: `0 4px 12px ${info.cor}44` }}>
                {info.rotulo} <ChevronRight size={15} />
              </button>
            )}
            {pedido.status === 'pronto' && (
              <button onClick={() => onFinalizar(pedido)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.7rem 1.125rem', borderRadius: '10px', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, background: `linear-gradient(145deg, ${C.success}, #00b060)`, border: 'none', color: '#fff', boxShadow: `0 4px 12px rgba(0,200,80,0.35)` }}>
                <Check size={16} /> Finalizar Pedido
              </button>
            )}
            {pedido.origem === 'balcao' && pedido.status !== 'pronto' && (
              <button onClick={() => onFinalizar(pedido)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.625rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.92rem', fontWeight: 700, background: 'linear-gradient(145deg, #F5C800, #e6b400)', border: 'none', color: '#1a1000' }}>
                <Check size={14} /> Finalizar Venda
              </button>
            )}
            {tel && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const statusMsg = {
                    recebido: `✅ Pedido *#${pedido.numero}* confirmado!\n\n⏱ Tempo estimado: *${CONFIG.tempoRetirada}*`,
                    preparando: `👨‍🍳 Seu pedido *#${pedido.numero}* já está sendo preparado!\n\n⏱ Previsão: *${CONFIG.tempoRetirada}*`,
                    pronto: `🎉 Seu pedido *#${pedido.numero}* está *PRONTO*!\n\n🏪 Pode vir retirar no balcão.`,
                    entregue: `📦 Pedido *#${pedido.numero}* entregue! Obrigado pela preferência! 🥟`,
                  }
                  const itensTexto = itens.map(i => `  • ${i.qtd || 1}x ${i.nome}`).join('\n')
                  const entregaTexto = pedido.tipo_entrega === 'entrega' && pedido.endereco
                    ? `\n🛵 *Entrega:* ${pedido.endereco}`
                    : `\n🏪 *Retirada na loja*`
                  const msg = `Olá, *${pedido.nome}*! 🥟\n\n${statusMsg[pedido.status] || statusMsg.recebido}\n\n📋 *Seus itens:*\n${itensTexto}\n\n💰 *Total:* R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}${entregaTexto}\n\n${CONFIG.nomeLoja} — ${CONFIG.slogan}\n📍 Acompanhe: ${window.location.origin}/acompanhar?tel=${tel}`
                  window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`, '_blank')
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.625rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.92rem', background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#6aff9e', fontWeight: 700 }}
              >
                💬 Enviar msg
              </button>
            )}
            <button onClick={() => onImprimir(pedido)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.625rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.92rem', background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text }}>
              <Printer size={15} /> Imprimir
            </button>
            <button onClick={() => onExcluir(pedido.id)} style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 0.75rem', borderRadius: '10px', cursor: 'pointer', background: 'rgba(200,0,0,0.12)', border: '1px solid rgba(200,0,0,0.3)', color: '#ff7777' }}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PaginaPedidos({ pedidos, novosIds, onStatus, onImprimir, onExcluir, onAtualizar, onCarregarData, onFinalizar }) {
  const [filtro, setFiltro] = useState('todos')
  const [expandidoId, setExpandidoId] = useState(null)
  const [periodo, setPeriodo] = useState('hoje')
  const [dataCustom, setDataCustom] = useState('')

  function getDataStr(offset = 0) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function mudarPeriodo(p) {
    setPeriodo(p)
    if (p === 'hoje') onCarregarData(getDataStr(0))
    else if (p === 'ontem') onCarregarData(getDataStr(-1))
  }

  function mudarDataCustom(val) {
    setDataCustom(val)
    setPeriodo('custom')
    if (val) onCarregarData(val)
  }

  function toggleExpandido(id) {
    setExpandidoId(prev => prev === id ? null : id)
  }

  const pagTotais = {}
  pedidos.forEach(p => {
    const k = (p.pagamento || 'outro').toLowerCase()
    pagTotais[k] = (pagTotais[k] || 0) + (Number(p.total) || 0)
  })

  const contadores = {
    recebido:   pedidos.filter(p => p.status === 'recebido').length,
    preparando: pedidos.filter(p => p.status === 'preparando').length,
    pronto:     pedidos.filter(p => p.status === 'pronto').length,
    entregue:   pedidos.filter(p => p.status === 'entregue').length,
  }

  const pedidosSite = pedidos.filter(p => p.origem !== 'balcao' && p.status !== 'entregue')
  const pedidosBalcao = pedidos.filter(p => p.origem === 'balcao' && p.status !== 'entregue')

  const filtrados = filtro === 'todos' ? pedidosSite : pedidosSite.filter(p => p.status === filtro)
  const filtradosBalcao = filtro === 'todos' ? pedidosBalcao : pedidosBalcao.filter(p => p.status === filtro)

  const contadoresSite = {
    recebido:   pedidosSite.filter(p => p.status === 'recebido').length,
    preparando: pedidosSite.filter(p => p.status === 'preparando').length,
    pronto:     pedidosSite.filter(p => p.status === 'pronto').length,
  }

  const totalAtivos = pedidosSite.length + pedidosBalcao.length
  const PILLS = [
    { val: 'todos',      label: 'Todos',     cnt: totalAtivos },
    { val: 'recebido',   label: 'Recebidos', cnt: contadores.recebido,   cor: '#F5C800' },
    { val: 'preparando', label: 'Preparando',cnt: contadores.preparando, cor: '#FF5252' },
    { val: 'pronto',     label: 'Prontos',   cnt: contadores.pronto,     cor: '#00e676' },
  ]

  const totalGeral = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0)

  const totalBalcao = pedidosBalcao.reduce((s, p) => s + (Number(p.total) || 0), 0)

  const totalPedidosSite = pedidos.filter(p => p.origem !== 'balcao').length
  const totalPedidosBalcao = pedidos.filter(p => p.origem === 'balcao').length

  const totalCaderneta = pagTotais['caderneta'] || 0
  const STATS = [
    { label: 'Site',     icon: Package,    val: String(totalPedidosSite) },
    { label: 'Balcão',   icon: Store,      val: String(totalPedidosBalcao) },
    { label: 'Total',    icon: DollarSign, val: fmtMoeda(totalGeral - totalCaderneta), sub: totalCaderneta > 0 ? `- ${fmtMoeda(totalCaderneta)} caderneta` : undefined, corSub: totalCaderneta > 0 ? '#ef4444' : undefined },
    { label: 'Pix',      icon: Banknote,   val: fmtMoeda(pagTotais['pix'] || 0) },
    { label: 'Dinheiro', icon: Banknote,   val: fmtMoeda(pagTotais['dinheiro'] || 0) },
    { label: 'Débito',   icon: Banknote,   val: fmtMoeda(pagTotais['débito'] || pagTotais['debito'] || 0) },
    { label: 'Crédito',  icon: Banknote,   val: fmtMoeda(pagTotais['crédito'] || pagTotais['credito'] || 0) },
    ...(totalCaderneta > 0 ? [{ label: 'Caderneta', icon: Banknote, val: `-${fmtMoeda(totalCaderneta)}`, corVal: '#ef4444', sub: 'a receber', corSub: '#ef4444' }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
        {STATS.map(s => (
          <KpiCard key={s.label} icon={s.icon} label={s.label} valor={s.val} sub={s.sub} corSub={s.corSub} corVal={s.corVal} />
        ))}
      </div>

      {/* Date filter */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { val: 'hoje', label: 'Hoje' },
          { val: 'ontem', label: 'Ontem' },
        ].map(btn => (
          <button
            key={btn.val}
            onClick={() => mudarPeriodo(btn.val)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
              background: periodo === btn.val ? '#F5C800' : 'rgba(255,235,235,0.70)',
              border: periodo === btn.val ? 'none' : `1px solid ${C.cardBorder}`,
              color: periodo === btn.val ? '#1a1a2e' : C.muted, transition: 'all 0.15s',
            }}
          >
            <Calendar size={13} />
            {btn.label}
          </button>
        ))}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="date"
            value={dataCustom}
            onChange={e => mudarDataCustom(e.target.value)}
            style={{
              padding: '0.4rem 0.75rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600,
              background: periodo === 'custom' ? '#F5C800' : 'rgba(255,235,235,0.70)',
              border: periodo === 'custom' ? 'none' : `1px solid ${C.cardBorder}`,
              color: periodo === 'custom' ? '#1a1a2e' : C.muted,
              outline: 'none', cursor: 'pointer',
            }}
          />
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {PILLS.map(pill => (
          <button
            key={pill.val}
            onClick={() => setFiltro(pill.val)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
              background: filtro === pill.val ? C.red : 'rgba(255,235,235,0.70)',
              border: filtro === pill.val ? 'none' : `1px solid ${C.cardBorder}`,
              color: filtro === pill.val ? '#fff' : C.muted, transition: 'all 0.15s',
            }}
          >
            {pill.label}
            <span style={{ background: filtro === pill.val ? 'rgba(255,255,255,0.25)' : (pill.cor ? pill.cor + '28' : 'rgba(255,235,235,0.78)'), color: filtro === pill.val ? '#fff' : (pill.cor || C.muted), borderRadius: '999px', fontSize: '0.65rem', padding: '1px 6px', fontWeight: 900 }}>
              {pill.cnt}
            </span>
          </button>
        ))}
        <button
          onClick={onAtualizar}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.78rem', background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.muted }}
        >
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* ══ SPLIT: Site | Balcão ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '1rem', alignItems: 'start' }}>

        {/* ── PEDIDOS SITE ── */}
        <div style={{
          background: 'rgba(255,248,248,0.92)', border: `1.5px solid ${C.cardBorder}`,
          borderRadius: '16px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
          height: 'calc(100vh - 210px)', overflowY: 'auto', overflowX: 'hidden',
          boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <h3 style={{ margin: 0, color: '#1A0000', fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
              🌐 Pedidos Site
              <span style={{ background: 'rgba(229,57,53,0.2)', color: '#FF7777', borderRadius: '999px', fontSize: '0.7rem', padding: '2px 8px', fontWeight: 900 }}>
                {filtrados.length}
              </span>
            </h3>
            <span style={{ color: C.gold, fontSize: '0.82rem', fontWeight: 700 }}>
              {fmtMoeda(filtrados.reduce((s, p) => s + (Number(p.total) || 0), 0))}
            </span>
          </div>
          {filtrados.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: '0.85rem', padding: '2rem 0' }}>
              Nenhum pedido do site
            </div>
          ) : (
            filtrados.map(p => (
              <CardPedido
                key={p.id}
                pedido={p}
                expandido={expandidoId === p.id}
                onToggle={() => toggleExpandido(p.id)}
                onStatus={onStatus}
                onImprimir={onImprimir}
                onExcluir={onExcluir}
                isNovo={novosIds?.has(p.id)}
                onFinalizar={onFinalizar}
              />
            ))
          )}
        </div>

        {/* ── PEDIDOS BALCÃO ── */}
        <div style={{
          background: 'rgba(255,252,230,0.94)', border: '1.5px solid rgba(160,130,0,0.38)',
          borderRadius: '16px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
          height: 'calc(100vh - 210px)', overflowY: 'auto', overflowX: 'hidden',
          boxShadow: '0 4px 20px rgba(100,80,0,0.14), 0 1px 4px rgba(100,80,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <h3 style={{ margin: 0, color: '#1A0000', fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
              🏪 Vendas Balcão
              <span style={{ background: 'rgba(245,200,0,0.15)', color: C.gold, borderRadius: '999px', fontSize: '0.7rem', padding: '2px 8px', fontWeight: 900 }}>
                {filtradosBalcao.length}
              </span>
            </h3>
            <span style={{ color: C.gold, fontSize: '0.82rem', fontWeight: 700 }}>
              {fmtMoeda(filtradosBalcao.reduce((s, p) => s + (Number(p.total) || 0), 0))}
            </span>
          </div>
          {filtradosBalcao.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: '0.85rem', padding: '2rem 0' }}>
              Nenhuma venda no balcão
            </div>
          ) : (
            filtradosBalcao.map(p => (
              <CardPedido
                key={p.id}
                pedido={p}
                expandido={expandidoId === p.id}
                onToggle={() => toggleExpandido(p.id)}
                onStatus={onStatus}
                onImprimir={onImprimir}
                onExcluir={onExcluir}
                isNovo={false}
                onFinalizar={onFinalizar}
              />
            ))
          )}
        </div>

      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA 3: CARDAPIO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PaginaCardapio({ config, onSalvar }) {
  const [form, setForm] = useState({
    especial_ativo: config?.especial_ativo || false,
    especial_nome: config?.especial_nome || CONFIG.especialNome,
    especial_descricao: config?.especial_descricao || CONFIG.especialDescricao,
    especial_preco: config?.especial_preco ?? CONFIG.especialPreco,
    desativados: config?.desativados || [],
    precos: config?.precos || {},
    combos: config?.combos || [],
  })

  // ── Sabores dinâmicos de bebidas ──────────────────────────────
  const [bebidaSabores, setBebidaSabores] = useState({}) // { bebida_id: ['Sabor1', ...] }
  const [novoSaborInput, setNovoSaborInput] = useState({}) // { bebida_id: texto }
  const [salvandoSabor, setSalvandoSabor] = useState({})

  useEffect(() => {
    apiFetch('/api/bebidas-sabores').then(r => r.json()).then(rows => {
      if (!Array.isArray(rows)) return
      const map = {}
      rows.forEach(r => { map[r.bebida_id] = r.sabores })
      setBebidaSabores(map)
    }).catch(() => {})
  }, [])

  function getSabores(beb) {
    // dinâmico tem prioridade; se não há entrada no DB, usa estático
    return bebidaSabores[beb.id] ?? beb.sabores ?? []
  }

  async function salvarSaboresBebida(bebidaId, novosSabores) {
    setSalvandoSabor(s => ({ ...s, [bebidaId]: true }))
    try {
      const r = await apiFetch('/api/bebidas-sabores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bebida_id: bebidaId, sabores: novosSabores }),
      })
      if (r.ok) {
        setBebidaSabores(prev => ({ ...prev, [bebidaId]: novosSabores }))
      }
    } finally {
      setSalvandoSabor(s => ({ ...s, [bebidaId]: false }))
    }
  }

  function adicionarSabor(beb) {
    const texto = (novoSaborInput[beb.id] || '').trim()
    if (!texto) return
    const atuais = getSabores(beb)
    if (atuais.includes(texto)) return
    const novos = [...atuais, texto]
    salvarSaboresBebida(beb.id, novos)
    setNovoSaborInput(prev => ({ ...prev, [beb.id]: '' }))
  }

  function removerSabor(beb, sabor) {
    const novos = getSabores(beb).filter(s => s !== sabor)
    salvarSaboresBebida(beb.id, novos)
  }

  useEffect(() => {
    if (!config) return
    setForm(f => ({
      ...f,
      especial_ativo: config.especial_ativo ?? f.especial_ativo,
      especial_nome: config.especial_nome ?? f.especial_nome,
      especial_descricao: config.especial_descricao ?? f.especial_descricao,
      especial_preco: config.especial_preco ?? f.especial_preco,
      desativados: config.desativados ?? f.desativados,
      precos: config.precos ?? f.precos,
      combos: config.combos ?? f.combos,
    }))
  }, [config])
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function toggleDesativado(id) {
    setForm(f => ({
      ...f,
      desativados: f.desativados.includes(id)
        ? f.desativados.filter(d => d !== id)
        : [...f.desativados, id],
    }))
  }

  function setPreco(id, val) {
    setForm(f => ({ ...f, precos: { ...f.precos, [id]: val } }))
  }

  async function salvar() {
    setSalvando(true)
    setErroSalvar('')
    try {
      await onSalvar(form)
      setOk(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setTimeout(() => setOk(false), 2500)
    } catch (e) {
      setErroSalvar(e.message || 'Erro ao salvar')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setTimeout(() => setErroSalvar(''), 5000)
    }
    setSalvando(false)
  }

  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
  }

  const inputStyle = {
    width: '100%', padding: '0.55rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem',
    background: 'rgba(255,255,255,0.90)', border: `1.5px solid ${C.cardBorder}`,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
  }

  return (
    <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* X-Tudao */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            X-Tudao Especial
          </h3>
          {/* Toggle switch */}
          <div
            onClick={() => setF('especial_ativo', !form.especial_ativo)}
            style={{
              width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer',
              background: form.especial_ativo ? C.gold : 'rgba(255,255,255,0.15)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: '3px',
              left: form.especial_ativo ? '23px' : '3px',
              width: '18px', height: '18px', borderRadius: '9px',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Nome</label>
            <input type="text" value={form.especial_nome} onChange={e => setF('especial_nome', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Preco (R$)</label>
            <input type="number" value={form.especial_preco} onChange={e => setF('especial_preco', parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Descricao</label>
          <input type="text" value={form.especial_descricao} onChange={e => setF('especial_descricao', e.target.value)} style={inputStyle} />
        </div>
        {form.especial_ativo && (
          <div style={{
            marginTop: '1rem', padding: '0.875rem', borderRadius: '12px',
            background: 'rgba(245,200,0,0.08)', border: '1px solid rgba(245,200,0,0.25)',
          }}>
            <div style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem', letterSpacing: '1px' }}>
              {form.especial_nome}
            </div>
            <div style={{ color: C.muted, fontSize: '0.78rem', margin: '2px 0' }}>{form.especial_descricao}</div>
            <div style={{ color: C.gold, fontWeight: 900, fontSize: '0.95rem' }}>{fmtMoeda(form.especial_preco)}</div>
          </div>
        )}
      </div>

      {/* Precos pasteis */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Precos dos Pasteis
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {TIPOS_PASTEL.map(t => {
            const ativo = !form.desativados.includes(t.id)
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.875rem',
                padding: '0.6rem 0.75rem', borderRadius: '10px',
                background: ativo ? 'rgba(255,255,255,0.88)' : 'rgba(200,0,0,0.07)',
                border: `1.5px solid ${ativo ? C.cardBorder : 'rgba(180,0,0,0.28)'}`,
                boxShadow: ativo ? C.cardShadow : 'none',
              }}>
                <div style={{ flex: 1 }}>
                  <span style={{ color: ativo ? C.text : C.muted, fontSize: '0.84rem', fontWeight: 600 }}>{t.nome}</span>
                  <span style={{ color: C.muted, fontSize: '0.7rem', marginLeft: '6px' }}>{t.subtitulo}</span>
                </div>
                <input
                  type="number"
                  value={form.precos[t.id] ?? t.preco}
                  onChange={e => setPreco(t.id, parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: '80px', textAlign: 'right' }}
                />
                <button
                  onClick={() => toggleDesativado(t.id)}
                  style={{
                    padding: '3px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700,
                    background: ativo ? 'rgba(0,200,80,0.12)' : 'rgba(200,0,0,0.18)',
                    border: `1px solid ${ativo ? 'rgba(0,200,80,0.3)' : 'rgba(200,0,0,0.35)'}`,
                    color: ativo ? C.success : '#ff7777',
                  }}
                >
                  {ativo ? 'On' : 'Off'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pastéis Doces */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🍫 Pastéis Doces
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {PASTEIS_DOCES.map(d => {
            const ativo = !form.desativados.includes(d.id)
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.5rem 0.75rem', borderRadius: '10px',
                background: ativo ? 'rgba(255,255,255,0.88)' : 'rgba(200,0,0,0.07)',
                border: `1.5px solid ${ativo ? C.cardBorder : 'rgba(180,0,0,0.28)'}`,
                boxShadow: ativo ? C.cardShadow : 'none',
              }}>
                <span style={{ flex: 1, color: ativo ? C.text : C.muted, fontSize: '0.82rem' }}>{d.nome}</span>
                <input
                  type="number"
                  value={form.precos[d.id] ?? d.preco}
                  onChange={e => setPreco(d.id, parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: '72px', textAlign: 'right' }}
                />
                <button
                  onClick={() => toggleDesativado(d.id)}
                  style={{
                    padding: '3px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700,
                    background: ativo ? 'rgba(0,200,80,0.12)' : 'rgba(200,0,0,0.18)',
                    border: `1px solid ${ativo ? 'rgba(0,200,80,0.3)' : 'rgba(200,0,0,0.35)'}`,
                    color: ativo ? C.success : '#ff7777',
                  }}
                >
                  {ativo ? 'On' : 'Off'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bebidas */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Bebidas
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {categorias[0].itens.map(b => {
            const ativo = !form.desativados.includes(b.id)
            return (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.5rem 0.75rem', borderRadius: '10px',
                background: ativo ? 'rgba(255,255,255,0.88)' : 'rgba(200,0,0,0.07)',
                border: `1.5px solid ${ativo ? C.cardBorder : 'rgba(180,0,0,0.28)'}`,
                boxShadow: ativo ? C.cardShadow : 'none',
              }}>
                <span style={{ flex: 1, color: ativo ? C.text : C.muted, fontSize: '0.82rem' }}>{b.nome}</span>
                <input
                  type="number"
                  value={form.precos[b.id] ?? b.preco}
                  onChange={e => setPreco(b.id, parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: '72px', textAlign: 'right' }}
                />
                <button
                  onClick={() => toggleDesativado(b.id)}
                  style={{
                    padding: '3px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700,
                    background: ativo ? 'rgba(0,200,80,0.12)' : 'rgba(200,0,0,0.18)',
                    border: `1px solid ${ativo ? 'rgba(0,200,80,0.3)' : 'rgba(200,0,0,0.35)'}`,
                    color: ativo ? C.success : '#ff7777',
                  }}
                >
                  {ativo ? 'On' : 'Off'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sabores Bebidas */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🥤 Sabores das Bebidas
        </h3>
        <p style={{ color: C.muted, fontSize: '0.75rem', margin: '-0.5rem 0 1rem' }}>
          Adicione ou remova sabores de qualquer bebida. As alterações aparecem imediatamente no cardápio.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {categorias[0].itens.filter(b => (getSabores(b).length > 0 || b.sabores)).map(beb => {
            const sabores = getSabores(beb)
            const carregando = salvandoSabor[beb.id]
            return (
              <div key={beb.id} style={{
                padding: '0.75rem', borderRadius: '12px',
                background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${C.cardBorder}`,
                boxShadow: C.cardShadow,
              }}>
                <div style={{ color: C.text, fontWeight: 700, fontSize: '0.84rem', marginBottom: '0.5rem' }}>
                  {beb.nome}
                  {carregando && <span style={{ color: C.muted, fontWeight: 400, fontSize: '0.72rem', marginLeft: '6px' }}>salvando…</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.625rem' }}>
                  {sabores.map(s => (
                    <span key={s} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600,
                      background: 'rgba(245,200,0,0.1)', border: '1px solid rgba(245,200,0,0.3)', color: C.gold,
                    }}>
                      {s}
                      <button
                        onClick={() => removerSabor(beb, s)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.75rem', padding: 0, lineHeight: 1 }}
                      >✕</button>
                    </span>
                  ))}
                  {sabores.length === 0 && (
                    <span style={{ color: C.muted, fontSize: '0.75rem' }}>Nenhum sabor cadastrado</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Novo sabor..."
                    value={novoSaborInput[beb.id] || ''}
                    onChange={e => setNovoSaborInput(prev => ({ ...prev, [beb.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') adicionarSabor(beb) }}
                    style={{
                      ...inputStyle, flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.8rem',
                    }}
                  />
                  <button
                    onClick={() => adicionarSabor(beb)}
                    style={{
                      padding: '0.4rem 0.875rem', borderRadius: '10px', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: 700,
                      background: 'rgba(0,200,80,0.12)', border: '1px solid rgba(0,200,80,0.3)', color: C.success,
                    }}
                  >
                    + Adicionar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sabores Salgados */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🧂 Sabores Salgados
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {SABORES_SALGADOS.map(s => {
            const id = `sabor-${s}`
            const ativo = !form.desativados.includes(id)
            return (
              <button
                key={id}
                onClick={() => toggleDesativado(id)}
                style={{
                  padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 700,
                  background: ativo ? 'rgba(0,200,80,0.12)' : 'rgba(200,0,0,0.12)',
                  border: `1px solid ${ativo ? 'rgba(0,200,80,0.3)' : 'rgba(200,0,0,0.3)'}`,
                  color: ativo ? C.success : '#ff7777',
                }}
              >
                {s} {ativo ? '✓' : '✕'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sabores Doces */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🍫 Sabores Doces
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {SABORES_DOCES.map(s => {
            const id = `sabor-${s}`
            const ativo = !form.desativados.includes(id)
            return (
              <button
                key={id}
                onClick={() => toggleDesativado(id)}
                style={{
                  padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 700,
                  background: ativo ? 'rgba(0,200,80,0.12)' : 'rgba(200,0,0,0.12)',
                  border: `1px solid ${ativo ? 'rgba(0,200,80,0.3)' : 'rgba(200,0,0,0.3)'}`,
                  color: ativo ? C.success : '#ff7777',
                }}
              >
                {s} {ativo ? '✓' : '✕'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Adicionais */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🥚 Adicionais
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {ADICIONAIS_LISTA.map(a => {
            const id = `adicional-${a}`
            const ativo = !form.desativados.includes(id)
            return (
              <button
                key={id}
                onClick={() => toggleDesativado(id)}
                style={{
                  padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 700,
                  background: ativo ? 'rgba(0,200,80,0.12)' : 'rgba(200,0,0,0.12)',
                  border: `1px solid ${ativo ? 'rgba(0,200,80,0.3)' : 'rgba(200,0,0,0.3)'}`,
                  color: ativo ? C.success : '#ff7777',
                }}
              >
                {a} {ativo ? '✓' : '✕'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Combos / Promoções */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🎉 Combos & Promoções
          </h3>
          <button
            onClick={() => {
              const novo = { id: `combo-${Date.now()}`, ativo: true, nome: '', descricao: '', preco: 0 }
              setF('combos', [...form.combos, novo])
            }}
            style={{
              padding: '5px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
              background: 'rgba(0,200,80,0.12)', border: '1px solid rgba(0,200,80,0.3)', color: C.success,
            }}
          >
            + Novo combo
          </button>
        </div>

        {form.combos.length === 0 && (
          <p style={{ color: C.muted, fontSize: '0.82rem', textAlign: 'center', padding: '1rem 0' }}>
            Nenhum combo cadastrado. Clique em "+ Novo combo" para criar.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {form.combos.map((combo, idx) => (
            <div key={combo.id} style={{
              padding: '0.875rem', borderRadius: '12px',
              background: combo.ativo ? 'rgba(255,255,255,0.92)' : 'rgba(200,0,0,0.07)',
              border: `1.5px solid ${combo.ativo ? C.cardBorder : 'rgba(180,0,0,0.28)'}`,
              boxShadow: combo.ativo ? C.cardShadow : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div
                  onClick={() => {
                    const updated = [...form.combos]
                    updated[idx] = { ...updated[idx], ativo: !updated[idx].ativo }
                    setF('combos', updated)
                  }}
                  style={{
                    width: '38px', height: '22px', borderRadius: '11px', cursor: 'pointer',
                    background: combo.ativo ? C.gold : 'rgba(255,255,255,0.15)',
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: combo.ativo ? '18px' : '2px',
                    width: '18px', height: '18px', borderRadius: '9px',
                    background: '#fff', transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }} />
                </div>
                <span style={{ color: combo.ativo ? C.gold : C.muted, fontSize: '0.72rem', fontWeight: 700 }}>
                  {combo.ativo ? 'Ativo' : 'Inativo'}
                </span>
                <button
                  onClick={() => setF('combos', form.combos.filter((_, i) => i !== idx))}
                  style={{
                    marginLeft: 'auto', padding: '3px 8px', borderRadius: '6px', cursor: 'pointer',
                    background: 'rgba(200,0,0,0.15)', border: '1px solid rgba(200,0,0,0.3)',
                    color: '#ff6666', fontSize: '0.68rem', fontWeight: 700,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <label style={labelStyle}>Nome do combo</label>
                  <input
                    type="text"
                    value={combo.nome}
                    onChange={e => {
                      const updated = [...form.combos]
                      updated[idx] = { ...updated[idx], nome: e.target.value }
                      setF('combos', updated)
                    }}
                    placeholder="Ex: Combo Família"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Preço (R$)</label>
                  <input
                    type="number"
                    value={combo.preco}
                    onChange={e => {
                      const updated = [...form.combos]
                      updated[idx] = { ...updated[idx], preco: parseFloat(e.target.value) || 0 }
                      setF('combos', updated)
                    }}
                    style={{ ...inputStyle, width: '90px', textAlign: 'right' }}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Descrição</label>
                <input
                  type="text"
                  value={combo.descricao || ''}
                  onChange={e => {
                    const updated = [...form.combos]
                    updated[idx] = { ...updated[idx], descricao: e.target.value }
                    setF('combos', updated)
                  }}
                  placeholder="Ex: 2 pastéis + 1 refrigerante"
                  style={inputStyle}
                />
              </div>

              {/* Preview */}
              {combo.ativo && combo.nome && (
                <div style={{
                  marginTop: '0.75rem', padding: '0.6rem 0.875rem', borderRadius: '10px',
                  background: 'rgba(200,0,0,0.1)', border: '1px solid rgba(200,0,0,0.25)',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}>
                  <span style={{ fontSize: '1.1rem' }}>🎉</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#1A0000', fontWeight: 700, fontSize: '0.82rem' }}>{combo.nome}</span>
                    {combo.descricao && <span style={{ color: C.muted, fontSize: '0.72rem', marginLeft: '6px' }}>{combo.descricao}</span>}
                  </div>
                  <span style={{ color: '#00c853', fontWeight: 900, fontSize: '0.85rem' }}>{fmtMoeda(combo.preco)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Salvar sticky */}
      <div style={{ position: 'sticky', bottom: '1rem', zIndex: 10 }}>
        {erroSalvar && (
          <div style={{ marginBottom: '0.5rem', padding: '0.625rem 1rem', borderRadius: '10px', background: 'rgba(200,0,0,0.2)', border: '1px solid rgba(200,0,0,0.5)', color: '#ff6666', fontSize: '0.82rem', fontWeight: 700 }}>
            {erroSalvar}
          </div>
        )}
        <button
          onClick={salvar}
          disabled={salvando}
          style={{
            width: '100%', padding: '1rem', borderRadius: '14px', cursor: salvando ? 'not-allowed' : 'pointer',
            fontSize: '1rem', fontWeight: 800, border: 'none',
            background: ok ? 'linear-gradient(145deg,#00c853,#00a844)' : `linear-gradient(145deg, ${C.gold}, #e6b400)`,
            color: ok ? '#fff' : '#1a1000',
            boxShadow: `0 6px 20px ${ok ? 'rgba(0,200,80,0.4)' : 'rgba(245,200,0,0.3)'}`,
            opacity: salvando ? 0.7 : 1, transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          {salvando ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : ok ? <Check size={16} /> : null}
          {salvando ? 'Salvando...' : ok ? 'Salvo com sucesso!' : 'Salvar Configuracoes'}
        </button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA 4: ESTOQUE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA: CLIENTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PaginaClientes() {
  const [clientes, setClientes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState(null)

  // Form novo/editar cliente
  const [novoForm, setNovoForm] = useState(false)
  const [formNome, setFormNome] = useState('')
  const [formCpf, setFormCpf] = useState('')
  const [formTel, setFormTel] = useState('')
  const [formRua, setFormRua] = useState('')
  const [formNumero, setFormNumero] = useState('')
  const [formComplemento, setFormComplemento] = useState('')
  const [formBairro, setFormBairro] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState(false)

  useEffect(() => {
    apiFetch('/api/clientes').then(r => r.json())
      .then(c => { setClientes(Array.isArray(c) ? c : []); setCarregando(false) })
      .catch(() => setCarregando(false))
  }, [])

  async function cadastrarCliente() {
    const nome = formNome.trim()
    const cpf = formCpf.replace(/\D/g, '')
    const telefone = formTel.replace(/\D/g, '')
    if (!nome) return
    setSalvandoCliente(true)
    const endereco = formRua.trim()
      ? { rua: formRua.trim(), numero: formNumero.trim(), complemento: formComplemento.trim(), bairro: formBairro.trim() }
      : undefined
    await apiFetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, cpf: cpf || null, telefone: telefone || '00000000000', manual: true, endereco }),
    })
    setFormNome(''); setFormCpf(''); setFormTel('')
    setFormRua(''); setFormNumero(''); setFormComplemento(''); setFormBairro('')
    setNovoForm(false)
    setSalvandoCliente(false)
    apiFetch('/api/clientes').then(r => r.json()).then(c => setClientes(Array.isArray(c) ? c : []))
  }

  async function removerCliente(id) {
    if (!confirm('Remover cliente?')) return
    await fetch(`/api/clientes?id=${id}`, { method: 'DELETE' })
    setClientes(prev => prev.filter(c => c.id !== id))
  }

  const filtrados = busca.trim()
    ? clientes.filter(c =>
        c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        (c.cpf || '').includes(busca.replace(/\D/g, '')) ||
        (c.telefone || '').includes(busca.replace(/\D/g, ''))
      )
    : clientes

  const inputSt = {
    padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.84rem',
    background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  }

  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
        <KpiCard icon={Users} label="Clientes" valor={String(clientes.length)} />
      </div>

      {/* Barra superior */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, CPF ou telefone..."
          style={{ flex: 1, padding: '0.55rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem', background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text, outline: 'none' }}
        />
        <button
          onClick={() => setNovoForm(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '0.55rem 0.875rem', borderRadius: '10px', cursor: 'pointer',
            fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap',
            background: novoForm ? 'rgba(229,57,53,0.2)' : 'rgba(0,200,80,0.12)',
            border: `1px solid ${novoForm ? 'rgba(229,57,53,0.4)' : 'rgba(0,200,80,0.3)'}`,
            color: novoForm ? '#ff7777' : C.success,
          }}
        >
          <UserPlus size={14} /> {novoForm ? 'Cancelar' : 'Novo cliente'}
        </button>
      </div>

      {/* Form novo cliente */}
      {novoForm && (
        <div style={{ ...cardStyle, padding: '1rem' }}>
          <p style={{ color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 0.75rem' }}>
            Cadastrar cliente
          </p>
          {/* Dados pessoais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Nome *</label>
              <input type="text" value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Nome completo" style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>CPF</label>
              <input type="text" value={formCpf} onChange={e => setFormCpf(e.target.value)} placeholder="000.000.000-00" style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Telefone</label>
              <input type="text" value={formTel} onChange={e => setFormTel(e.target.value)} placeholder="(00) 00000-0000" style={{ ...inputSt, width: '100%' }} />
            </div>
          </div>
          {/* Endereço */}
          <p style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 0.5rem' }}>
            Endereço (opcional)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Rua</label>
              <input type="text" value={formRua} onChange={e => setFormRua(e.target.value)} placeholder="Nome da rua" style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Número</label>
              <input type="text" value={formNumero} onChange={e => setFormNumero(e.target.value)} placeholder="123" style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Compl.</label>
              <input type="text" value={formComplemento} onChange={e => setFormComplemento(e.target.value)} placeholder="Apto, bloco..." style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>Bairro</label>
              <input type="text" value={formBairro} onChange={e => setFormBairro(e.target.value)} placeholder="Bairro" style={{ ...inputSt, width: '100%' }} />
            </div>
          </div>
          <button
            onClick={cadastrarCliente}
            disabled={!formNome.trim() || salvandoCliente}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', border: 'none',
              background: formNome.trim() ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.75)',
              color: formNome.trim() ? '#fff' : C.muted,
            }}
          >
            {salvandoCliente ? 'Salvando...' : '+ Cadastrar'}
          </button>
        </div>
      )}

      {carregando ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: C.muted }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
          <p style={{ fontSize: '0.85rem' }}>Carregando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem', color: C.muted }}>
          <Users size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p style={{ margin: 0, fontSize: '0.88rem' }}>{busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ color: C.muted, fontSize: '0.74rem' }}>
            {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''}
          </div>
          {filtrados.map(c => {
            const aberto = expandido === c.id
            const tel = (c.telefone || '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
            return (
              <div key={c.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandido(aberto ? null : c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', cursor: 'pointer' }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(145deg, rgba(200,0,0,0.3), rgba(100,0,0,0.4))',
                    border: '1px solid rgba(200,0,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.gold, fontWeight: 900, fontSize: '0.85rem',
                  }}>
                    {(c.nome || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.text, fontWeight: 700, fontSize: '0.88rem' }}>{c.nome}</div>
                    <div style={{ color: C.muted, fontSize: '0.72rem' }}>
                      {tel}{c.cpf ? ` · CPF ${c.cpf}` : ''}
                    </div>
                  </div>
                  <div style={{ color: C.muted, fontSize: '0.72rem', flexShrink: 0 }}>
                    {c.total_pedidos || 0} pedido{(c.total_pedidos || 0) !== 1 ? 's' : ''}
                  </div>
                </div>

                {aberto && (
                  <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: '0.875rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ color: C.muted, fontSize: '0.75rem' }}>
                        Cadastrado em: {new Date(c.created_at).toLocaleDateString('pt-BR')}
                      </div>
                      {c.enderecos?.length > 0 && (
                        <div>
                          <div style={{ color: C.text, fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>Endereços</div>
                          {c.enderecos.map((end, idx) => (
                            <div key={idx} style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.cardBorder}`, fontSize: '0.78rem', color: 'rgba(15,0,0,0.85)', marginBottom: '4px' }}>
                              📍 {end.rua}, {end.numero}{end.complemento ? ` - ${end.complemento}` : ''} — {end.bairro}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {c.telefone && c.telefone !== '00000000000' && (
                          <a href={`https://wa.me/55${c.telefone}`} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '0.4rem 0.75rem', borderRadius: '8px', background: 'rgba(0,200,80,0.12)', border: '1px solid rgba(0,200,80,0.3)', color: '#6aff9e', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}
                          >💬 WhatsApp</a>
                        )}
                        <button
                          onClick={() => removerCliente(c.id)}
                          style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', background: 'rgba(200,0,0,0.12)', border: '1px solid rgba(200,0,0,0.3)', color: '#ff7777', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                        >🗑 Remover</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA: CADERNETA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PaginaCaderneta() {
  const [clientes, setClientes] = useState([])
  const [caderneta, setCaderneta] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState(null)

  // Modal novo lançamento (qualquer cliente)
  const [modalNovoLanc, setModalNovoLanc] = useState(false)
  const [novoLancBusca, setNovoLancBusca] = useState('')
  const [novoLancCliente, setNovoLancCliente] = useState(null)

  // Modal de recebimento de caderneta
  const [modalPagCaderneta, setModalPagCaderneta] = useState(null) // { entrada, clienteNome }
  const [formaPagCaderneta, setFormaPagCaderneta] = useState('dinheiro')
  const [salvandoPagCaderneta, setSalvandoPagCaderneta] = useState(false)

  // Lançamento avulso (dentro do card do cliente)
  const [novaEntradaCliente, setNovaEntradaCliente] = useState(null)
  const [entDescricao, setEntDescricao] = useState('')
  const [entValor, setEntValor] = useState('')
  const [entVencimento, setEntVencimento] = useState('')
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)

  // Modo de descrição do lançamento: 'cardapio' ou 'manual'
  const [modoLanc, setModoLanc] = useState('cardapio')
  const [descBusca, setDescBusca] = useState('')
  const [catalogoLanc, setCatalogoLanc] = useState([])

  // Limite de crédito
  const [editandoLimite, setEditandoLimite] = useState(null)
  const [limiteInput, setLimiteInput] = useState('')
  const [salvandoLimite, setSalvandoLimite] = useState(false)

  // Edição de vencimento por entrada
  const [editandoVencimento, setEditandoVencimento] = useState(null)
  const [vencimentoInput, setVencimentoInput] = useState('')

  function carregarTudo() {
    setCarregando(true)
    Promise.all([
      apiFetch('/api/clientes').then(r => r.json()),
      apiFetch('/api/caderneta').then(r => r.json()),
      apiFetch('/api/catalogo').then(r => r.json()).catch(() => []),
    ]).then(([c, d, cat]) => {
      setClientes(Array.isArray(c) ? c : [])
      setCaderneta(Array.isArray(d) ? d : [])
      setCatalogoLanc(Array.isArray(cat) ? cat : [])
      setCarregando(false)
    }).catch(() => setCarregando(false))
  }

  useEffect(() => { carregarTudo() }, [])

  async function marcarPago(entradaId, pago) {
    if (pago) {
      // Ao quitar: abrir modal para registrar forma de pagamento no caixa
      const entrada = caderneta.find(e => e.id === entradaId)
      const cliente = clientes.find(c => c.id === entrada?.cliente_id)
      setModalPagCaderneta({ entrada, clienteNome: cliente?.nome || 'Cliente' })
      setFormaPagCaderneta('dinheiro')
      return
    }
    // Desfazer pagamento: apenas marcar como não pago, sem movimento no caixa
    await fetch(`/api/caderneta?id=${entradaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pago: false }),
    })
    setCaderneta(prev => prev.map(e => e.id === entradaId ? { ...e, pago: false } : e))
  }

  async function confirmarPagamentoCaderneta() {
    const { entrada, clienteNome } = modalPagCaderneta
    setSalvandoPagCaderneta(true)
    setModalPagCaderneta(null)

    // 1. Marcar entrada como paga na caderneta
    await fetch(`/api/caderneta?id=${entrada.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pago: true }),
    })
    setCaderneta(prev => prev.map(e => e.id === entrada.id ? { ...e, pago: true } : e))

    // 2. Registrar recebimento no fluxo de caixa
    try {
      const res = await apiFetch('/api/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: clienteNome,
          telefone: '',
          pagamento: formaPagCaderneta,
          itens: [{ nome: `Pgto caderneta — ${clienteNome}`, qtd: 1, preco: Number(entrada.valor) }],
          subtotal: Number(entrada.valor),
          total: Number(entrada.valor),
          origem: 'balcao',
          observacao: `📒 Pgto caderneta — ${clienteNome} (${entrada.descricao || ''})`,
          tipo_entrega: 'retirada',
        }),
      })
      if (res.ok) {
        const pedidoCriado = await res.json()
        if (pedidoCriado?.id) {
          await apiFetch('/api/pedido', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pedidoCriado.id, status: 'entregue', force_status: true }),
          })
        }
      }
    } catch (err) {
      console.error('[caderneta] Erro ao registrar no caixa:', err)
    }
    setSalvandoPagCaderneta(false)
  }

  async function removerEntrada(entradaId) {
    await fetch(`/api/caderneta?id=${entradaId}`, { method: 'DELETE' })
    setCaderneta(prev => prev.filter(e => e.id !== entradaId))
  }

  const saldoPorCliente = {}
  caderneta.filter(e => !e.pago).forEach(e => {
    saldoPorCliente[e.cliente_id] = (saldoPorCliente[e.cliente_id] || 0) + Number(e.valor)
  })

  async function adicionarEntrada(cliente) {
    const desc = entDescricao.trim()
    const val = parseFloat(String(entValor).replace(',', '.'))
    if (!desc || !(val > 0)) return
    const saldoAtual = saldoPorCliente[cliente.id] || 0
    const limite = cliente.limite_credito ? Number(cliente.limite_credito) : null
    if (limite !== null && saldoAtual + val > limite) {
      alert(`Limite de crédito atingido!\nLimite: ${fmtMoeda(limite)} · Em aberto: ${fmtMoeda(saldoAtual)}\nNão é possível lançar ${fmtMoeda(val)}.`)
      return
    }
    setSalvandoEntrada(true)
    const res = await apiFetch('/api/caderneta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: cliente.id, descricao: desc, valor: val, data: new Date().toLocaleDateString('pt-BR'), itens: [], vencimento: entVencimento || null }),
    })
    if (res.ok) {
      const nova = await res.json()
      setCaderneta(prev => [nova, ...prev])
      setEntDescricao(''); setEntValor(''); setEntVencimento('')
      setNovaEntradaCliente(null)
    } else {
      const err = await res.json().catch(() => ({}))
      alert(`Erro ao salvar na caderneta: ${err.error || res.status}`)
    }
    setSalvandoEntrada(false)
  }

  async function salvarLimite(clienteId) {
    setSalvandoLimite(true)
    const val = limiteInput === '' ? null : parseFloat(limiteInput)
    const res = await fetch(`/api/clientes?id=${clienteId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limite_credito: isNaN(val) ? null : val }),
    })
    if (res.ok) {
      const updated = await res.json()
      setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, limite_credito: updated.limite_credito } : c))
    }
    setEditandoLimite(null); setLimiteInput('')
    setSalvandoLimite(false)
  }

  async function salvarVencimento(entradaId) {
    await fetch(`/api/caderneta?id=${entradaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vencimento: vencimentoInput || null }),
    })
    setCaderneta(prev => prev.map(e => e.id === entradaId ? { ...e, vencimento: vencimentoInput || null } : e))
    setEditandoVencimento(null); setVencimentoInput('')
  }

  // Abate parcial: marca original como pago, cria novo com saldo restante
  async function abaterEntrada(entrada, valorPago, formaPag) {
    const restante = Number(entrada.valor) - valorPago
    const cliente = clientes.find(c => c.id === entrada.cliente_id)
    const clienteNome = cliente?.nome || 'Cliente'

    // Marcar original como pago
    await fetch(`/api/caderneta?id=${entrada.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pago: true }),
    })
    setCaderneta(prev => prev.map(e => e.id === entrada.id ? { ...e, pago: true } : e))

    // Registrar pagamento parcial no caixa
    try {
      const res = await apiFetch('/api/pedido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: clienteNome,
          telefone: '',
          pagamento: formaPag || 'dinheiro',
          itens: [{ nome: `Pgto parcial caderneta — ${clienteNome}`, qtd: 1, preco: valorPago }],
          subtotal: valorPago,
          total: valorPago,
          origem: 'balcao',
          observacao: `📒 Pgto parcial caderneta — ${clienteNome} (${entrada.descricao || ''})`,
          tipo_entrega: 'retirada',
        }),
      })
      if (res.ok) {
        const p = await res.json()
        if (p?.id) await apiFetch('/api/pedido', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id, status: 'entregue', force_status: true }),
        })
      }
    } catch {}


    // Se sobrou saldo, criar nova entrada com o restante
    if (restante > 0.01) {
      const res = await apiFetch('/api/caderneta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: entrada.cliente_id,
          descricao: `${entrada.descricao || 'Lançamento'} (saldo)`,
          valor: Math.round(restante * 100) / 100,
          data: new Date().toLocaleDateString('pt-BR'),
          itens: [],
          vencimento: entrada.vencimento || null,
        }),
      })
      if (res.ok) {
        const nova = await res.json()
        setCaderneta(prev => [nova, ...prev])
      }
    }
  }

  // Lista unificada de produtos do cardápio para autocomplete
  const produtosCardapio = [
    ...TIPOS_PASTEL.map(t => ({ nome: t.nome, preco: t.preco })),
    ...PASTEIS_DOCES.map(d => ({ nome: `Pastel ${d.nome}`, preco: d.preco })),
    ...categorias.flatMap(cat => cat.itens.map(i => ({ nome: i.nome, preco: i.preco }))),
    ...catalogoLanc.map(i => ({ nome: i.nome, preco: i.preco })),
  ]

  const hoje = new Date().toISOString().slice(0, 10)
  const totalAberto = Object.values(saldoPorCliente).reduce((s, v) => s + v, 0)
  const vencidosGlobal = caderneta.filter(e => !e.pago && e.vencimento && e.vencimento < hoje)
  const totalVencido = vencidosGlobal.reduce((s, e) => s + Number(e.valor), 0)

  // Clientes que têm alguma entrada na caderneta
  const clientesComEntrada = clientes.filter(c =>
    caderneta.some(e => e.cliente_id === c.id)
  )
  const filtrados = busca.trim()
    ? clientesComEntrada.filter(c =>
        c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        (c.cpf || '').includes(busca.replace(/\D/g, ''))
      )
    : clientesComEntrada

  const inputSt = {
    padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.84rem',
    background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  }
  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Modal de recebimento de caderneta */}
      {modalPagCaderneta && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#1e1e1e', border: `1px solid ${C.cardBorder}`, borderRadius: '20px', padding: '1.5rem', width: '100%', maxWidth: '360px' }}>
            <h3 style={{ color: '#f59e0b', fontWeight: 900, fontSize: '1rem', margin: '0 0 0.25rem' }}>📒 Recebimento de Caderneta</h3>
            <p style={{ color: C.muted, fontSize: '0.8rem', margin: '0 0 1rem' }}>
              Cliente: <strong style={{ color: C.text }}>{modalPagCaderneta.clienteNome}</strong>
              {' · '}Valor: <strong style={{ color: C.success }}>{fmtMoeda(Number(modalPagCaderneta.entrada.valor))}</strong>
            </p>
            {modalPagCaderneta.entrada.descricao && (
              <p style={{ color: C.muted, fontSize: '0.75rem', margin: '0 0 1rem', background: 'rgba(255,255,255,0.04)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                Ref: {modalPagCaderneta.entrada.descricao}
              </p>
            )}
            <p style={{ color: C.text, fontSize: '0.82rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Como o cliente pagou?</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {[['dinheiro','💵 Dinheiro'],['pix','📱 Pix'],['debito','💳 Débito'],['credito','💳 Crédito']].map(([val, label]) => (
                <button key={val} onClick={() => setFormaPagCaderneta(val)} style={{
                  padding: '0.6rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                  background: formaPagCaderneta === val ? C.red : 'rgba(255,255,255,0.07)',
                  color: formaPagCaderneta === val ? '#fff' : C.muted,
                }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setModalPagCaderneta(null)} style={{ flex: 1, padding: '0.7rem', borderRadius: '10px', border: `1px solid ${C.cardBorder}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={confirmarPagamentoCaderneta} disabled={salvandoPagCaderneta} style={{ flex: 2, padding: '0.7rem', borderRadius: '10px', border: 'none', background: C.success, color: '#000', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 900 }}>
                ✅ Confirmar recebimento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
        <KpiCard icon={BookOpen} label="Em aberto" valor={fmtMoeda(totalAberto)} />
        {totalVencido > 0 && <KpiCard icon={Calendar} label="Vencidos" valor={fmtMoeda(totalVencido)} cor={C.danger} />}
        <KpiCard icon={Users} label="Devedores" valor={String(Object.keys(saldoPorCliente).filter(id => saldoPorCliente[id] > 0).length)} />
      </div>

      {/* Busca + botão novo lançamento */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar cliente na caderneta..."
          style={{ flex: 1, padding: '0.55rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem', background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text, outline: 'none' }}
        />
        <button
          onClick={() => { setModalNovoLanc(true); setNovoLancBusca(''); setNovoLancCliente(null); setEntDescricao(''); setEntValor(''); setEntVencimento('') }}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.55rem 0.875rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(0,200,80,0.12)', border: '1px solid rgba(0,200,80,0.3)', color: C.success }}
        >
          <UserPlus size={14} /> Novo lançamento
        </button>
      </div>

      {/* Modal novo lançamento */}
      {modalNovoLanc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setModalNovoLanc(false) }}
        >
          <div style={{ background: 'rgba(255,240,240,0.97)', border: `1px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: C.text, fontWeight: 800, fontSize: '0.95rem' }}>📒 Novo lançamento na caderneta</span>
              <button onClick={() => setModalNovoLanc(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '1.1rem' }}>✕</button>
            </div>

            {/* Seleção de cliente */}
            {!novoLancCliente ? (
              <div style={{ position: 'relative' }}>
                <label style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Cliente *</label>
                <input
                  type="text"
                  value={novoLancBusca}
                  onChange={e => setNovoLancBusca(e.target.value)}
                  placeholder="Digite o nome ou CPF..."
                  autoFocus
                  style={{ width: '100%', padding: '0.6rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem', background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text, outline: 'none', boxSizing: 'border-box' }}
                />
                {novoLancBusca.trim().length >= 1 && (() => {
                  const q = novoLancBusca.trim().toLowerCase()
                  const matches = clientes.filter(c =>
                    c.nome?.toLowerCase().includes(q) || (c.cpf || '').includes(novoLancBusca.replace(/\D/g, ''))
                  ).slice(0, 8)
                  if (matches.length === 0) return (
                    <div style={{ marginTop: '6px', color: C.muted, fontSize: '0.8rem', fontStyle: 'italic' }}>Nenhum cliente encontrado.</div>
                  )
                  return (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: 'rgba(255,240,240,0.97)', border: `1px solid ${C.cardBorder}`, borderRadius: '10px', overflow: 'hidden', marginTop: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                      {matches.map(c => (
                        <button key={c.id} onClick={() => { setNovoLancCliente(c); setNovoLancBusca('') }}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0.625rem 0.875rem', background: 'none', border: 'none', borderBottom: `1px solid ${C.cardBorder}`, cursor: 'pointer', textAlign: 'left' }}
                        >
                          <div>
                            <div style={{ color: C.text, fontWeight: 700, fontSize: '0.85rem' }}>{c.nome}</div>
                            <div style={{ color: C.muted, fontSize: '0.7rem' }}>{c.cpf ? `CPF ${c.cpf}` : (c.telefone !== '00000000000' ? c.telefone : '')}</div>
                          </div>
                          {(saldoPorCliente[c.id] || 0) > 0 && (
                            <span style={{ color: '#ff9944', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>
                              📒 {fmtMoeda(saldoPorCliente[c.id])}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', borderRadius: '10px', background: 'rgba(255,100,0,0.1)', border: '1px solid rgba(255,100,0,0.3)' }}>
                <div>
                  <div style={{ color: C.text, fontWeight: 700 }}>{novoLancCliente.nome}</div>
                  <div style={{ color: C.muted, fontSize: '0.72rem' }}>
                    Em aberto: {fmtMoeda(saldoPorCliente[novoLancCliente.id] || 0)}
                    {novoLancCliente.limite_credito && <span> / limite {fmtMoeda(novoLancCliente.limite_credito)}</span>}
                  </div>
                </div>
                <button onClick={() => setNovoLancCliente(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>✕</button>
              </div>
            )}

            {/* Campos do lançamento */}
            {novoLancCliente && (
              <FormLancamento
                C={C} inputSt={{ padding: '0.6rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem', background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text, outline: 'none', boxSizing: 'border-box' }}
                modoLanc={modoLanc} setModoLanc={setModoLanc}
                descBusca={descBusca} setDescBusca={setDescBusca}
                produtosCardapio={produtosCardapio}
                entDescricao={entDescricao} setEntDescricao={setEntDescricao}
                entValor={entValor} setEntValor={setEntValor}
                entVencimento={entVencimento} setEntVencimento={setEntVencimento}
                salvandoEntrada={salvandoEntrada}
                onSalvar={async () => {
                  await adicionarEntrada(novoLancCliente)
                  if (!salvandoEntrada) { setModalNovoLanc(false); setExpandido(novoLancCliente.id) }
                }}
                fullWidth
              />
            )}
          </div>
        </div>
      )}

      {carregando ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: C.muted }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
          <p style={{ fontSize: '0.85rem' }}>Carregando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem', color: C.muted }}>
          <BookOpen size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p style={{ margin: 0, fontSize: '0.88rem' }}>
            {busca ? 'Nenhum cliente encontrado' : 'Caderneta vazia — nenhuma venda anotada ainda'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtrados
            .sort((a, b) => (saldoPorCliente[b.id] || 0) - (saldoPorCliente[a.id] || 0))
            .map(c => {
              const aberto = expandido === c.id
              const saldo = saldoPorCliente[c.id] || 0
              const entradasCliente = caderneta.filter(e => e.cliente_id === c.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              const vencidosCliente = entradasCliente.filter(e => !e.pago && e.vencimento && e.vencimento < hoje)
              const normaisCliente = entradasCliente.filter(e => e.pago || !e.vencimento || e.vencimento >= hoje)
              const limiteAtingido = c.limite_credito && saldo >= Number(c.limite_credito)

              return (
                <div key={c.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden', border: `1px solid ${vencidosCliente.length > 0 ? 'rgba(255,50,50,0.3)' : 'rgba(255,255,255,0.12)'}` }}>
                  {/* Header cliente */}
                  <div
                    onClick={() => setExpandido(aberto ? null : c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.1rem', cursor: 'pointer' }}
                  >
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(145deg, rgba(200,0,0,0.35), rgba(100,0,0,0.5))',
                      border: '1px solid rgba(200,0,0,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: C.gold, fontWeight: 900, fontSize: '1.05rem',
                    }}>
                      {(c.nome || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#1A0000', fontWeight: 700, fontSize: '1rem' }}>
                        {c.nome}
                        {vencidosCliente.length > 0 && <span style={{ marginLeft: 6, color: '#ff8080', fontSize: '0.82rem', fontWeight: 800 }}>⚠️ {vencidosCliente.length} vencido{vencidosCliente.length > 1 ? 's' : ''}</span>}
                      </div>
                      <div style={{ color: 'rgba(15,0,0,0.82)', fontSize: '0.82rem', marginTop: '2px' }}>
                        {(c.telefone || '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
                        {c.cpf ? ` · CPF ${c.cpf}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: saldo > 0 ? '#ff9944' : '#00e676' }}>
                        {fmtMoeda(saldo)}
                      </div>
                      {c.limite_credito && (
                        <div style={{ fontSize: '0.78rem', color: limiteAtingido ? '#ff8080' : 'rgba(255,255,255,0.5)' }}>
                          limite {fmtMoeda(c.limite_credito)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Painel expandido */}
                  {aberto && (
                    <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: '0.875rem 1rem' }}>

                      {/* Header caderneta + ações */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                          {entradasCliente.length} lançamento{entradasCliente.length !== 1 ? 's' : ''}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => { setEditandoLimite(editandoLimite === c.id ? null : c.id); setLimiteInput(c.limite_credito ?? '') }}
                            style={{ padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, background: 'rgba(255,200,0,0.12)', border: '1px solid rgba(255,200,0,0.35)', color: C.gold, display: 'flex', alignItems: 'center', gap: '4px', touchAction: 'manipulation' }}
                          ><CreditCard size={13} />Limite</button>
                          <button
                            onClick={() => setNovaEntradaCliente(novaEntradaCliente === c.id ? null : c.id)}
                            style={{ padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, background: 'rgba(0,200,80,0.14)', border: '1px solid rgba(0,200,80,0.35)', color: '#00e676', touchAction: 'manipulation' }}
                          >+ Lançar</button>
                        </div>
                      </div>

                      {/* Edição de limite */}
                      {editandoLimite === c.id && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <input type="number" min="0" step="0.01" value={limiteInput} onChange={e => setLimiteInput(e.target.value)} placeholder="Valor máximo (vazio = sem limite)" style={{ ...inputSt, flex: 1 }} />
                          <button onClick={() => salvarLimite(c.id)} disabled={salvandoLimite} style={{ padding: '0.45rem 0.875rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', border: 'none', background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, color: '#fff' }}>{salvandoLimite ? '...' : 'Salvar'}</button>
                          <button onClick={() => { setEditandoLimite(null); setLimiteInput('') }} style={{ padding: '0.45rem 0.625rem', borderRadius: '8px', cursor: 'pointer', background: 'none', border: `1px solid ${C.cardBorder}`, color: C.muted, fontSize: '0.8rem' }}>✕</button>
                        </div>
                      )}

                      {/* Form novo lançamento */}
                      {novaEntradaCliente === c.id && (
                        <FormLancamento
                          C={C} inputSt={inputSt}
                          modoLanc={modoLanc} setModoLanc={setModoLanc}
                          descBusca={descBusca} setDescBusca={setDescBusca}
                          produtosCardapio={produtosCardapio}
                          entDescricao={entDescricao} setEntDescricao={setEntDescricao}
                          entValor={entValor} setEntValor={setEntValor}
                          entVencimento={entVencimento} setEntVencimento={setEntVencimento}
                          salvandoEntrada={salvandoEntrada}
                          onSalvar={() => adicionarEntrada(c)}
                        />
                      )}

                      {/* Entradas */}
                      {entradasCliente.length === 0 ? (
                        <div style={{ color: C.muted, fontSize: '0.78rem', fontStyle: 'italic' }}>Nenhum lançamento.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {vencidosCliente.length > 0 && (
                            <>
                              <div style={{ color: C.danger, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>⚠️ Vencidos</div>
                              {vencidosCliente.map(e => <EntradaCadernetaRow key={e.id} e={e} hoje={hoje} C={C} inputSt={inputSt} editandoVencimento={editandoVencimento} vencimentoInput={vencimentoInput} setEditandoVencimento={setEditandoVencimento} setVencimentoInput={setVencimentoInput} marcarPago={marcarPago} removerEntrada={removerEntrada} salvarVencimento={salvarVencimento} abaterEntrada={abaterEntrada} />)}
                              {normaisCliente.length > 0 && <div style={{ borderTop: `1px solid ${C.cardBorder}`, margin: '4px 0' }} />}
                            </>
                          )}
                          {normaisCliente.map(e => <EntradaCadernetaRow key={e.id} e={e} hoje={hoje} C={C} inputSt={inputSt} editandoVencimento={editandoVencimento} vencimentoInput={vencimentoInput} setEditandoVencimento={setEditandoVencimento} setVencimentoInput={setVencimentoInput} marcarPago={marcarPago} removerEntrada={removerEntrada} salvarVencimento={salvarVencimento} abaterEntrada={abaterEntrada} />)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

function FormLancamento({ C, inputSt, modoLanc, setModoLanc, descBusca, setDescBusca, produtosCardapio, entDescricao, setEntDescricao, entValor, setEntValor, entVencimento, setEntVencimento, salvandoEntrada, onSalvar, fullWidth }) {
  const podeSubmit = entDescricao.trim() && parseFloat(entValor) > 0

  // Produtos filtrados pelo que foi digitado
  const sugestoes = descBusca.trim().length >= 1
    ? produtosCardapio.filter(p => p.nome.toLowerCase().includes(descBusca.trim().toLowerCase())).slice(0, 8)
    : []

  const wrapStyle = fullWidth
    ? { display: 'flex', flexDirection: 'column', gap: '0.625rem' }
    : { padding: '0.75rem', borderRadius: '10px', marginBottom: '0.5rem', background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.cardBorder}`, display: 'flex', flexDirection: 'column', gap: '0.625rem' }

  return (
    <div style={wrapStyle}>
      {/* Toggle Cardápio / Manual */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[{ id: 'cardapio', label: '📋 Do cardápio' }, { id: 'manual', label: '✏️ Manual' }].map(op => (
          <button
            key={op.id}
            onClick={() => { setModoLanc(op.id); setEntDescricao(''); setEntValor(''); setDescBusca('') }}
            style={{
              padding: '4px 12px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 700, border: 'none',
              background: modoLanc === op.id ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,255,255,0.07)',
              color: modoLanc === op.id ? '#fff' : C.muted,
            }}
          >{op.label}</button>
        ))}
      </div>

      {/* Cardápio: busca com autocomplete */}
      {modoLanc === 'cardapio' && (
        <div style={{ position: 'relative' }}>
          {entDescricao ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.75rem', borderRadius: '8px', background: 'rgba(255,100,0,0.1)', border: '1px solid rgba(255,100,0,0.3)' }}>
              <span style={{ flex: 1, color: C.text, fontSize: '0.85rem', fontWeight: 600 }}>{entDescricao}</span>
              <span style={{ color: '#ff9944', fontWeight: 800, fontSize: '0.85rem' }}>{fmtMoeda(parseFloat(entValor) || 0)}</span>
              <button onClick={() => { setEntDescricao(''); setEntValor(''); setDescBusca('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '0 2px', fontSize: '0.85rem' }}>✕</button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={descBusca}
                onChange={e => setDescBusca(e.target.value)}
                placeholder="Digite para buscar no cardápio..."
                style={{ ...inputSt, width: '100%' }}
              />
              {sugestoes.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 30, background: 'rgba(255,240,240,0.97)', border: `1px solid ${C.cardBorder}`, borderRadius: '10px', overflow: 'hidden', marginTop: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                  {sugestoes.map((p, i) => (
                    <button key={i}
                      onClick={() => { setEntDescricao(p.nome); setEntValor(String(p.preco)); setDescBusca('') }}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0.5rem 0.875rem', background: 'none', border: 'none', borderBottom: `1px solid ${C.cardBorder}`, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{ color: C.text, fontSize: '0.85rem' }}>{p.nome}</span>
                      <span style={{ color: '#ff9944', fontWeight: 700, fontSize: '0.82rem', flexShrink: 0 }}>{fmtMoeda(p.preco)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Manual: texto livre */}
      {modoLanc === 'manual' && (
        <input
          type="text"
          value={entDescricao}
          onChange={e => setEntDescricao(e.target.value)}
          placeholder="Descrição livre (ex: conserto, serviço...)"
          style={{ ...inputSt, width: '100%' }}
        />
      )}

      {/* Valor + Vencimento */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '80px' }}>
          <label style={{ color: C.muted, fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase' }}>Valor R$ *</label>
          <input type="number" value={entValor} onChange={e => setEntValor(e.target.value)} placeholder="0,00" min="0" step="0.01" style={{ ...inputSt, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <label style={{ color: C.muted, fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase' }}>Vencimento</label>
          <input type="date" value={entVencimento} onChange={e => setEntVencimento(e.target.value)} style={{ ...inputSt, width: '140px', colorScheme: 'dark' }} />
        </div>
        <button
          onClick={onSalvar}
          disabled={!podeSubmit || salvandoEntrada}
          style={{ padding: '0.5rem 1.1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', border: 'none', background: podeSubmit ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.75)', color: podeSubmit ? '#fff' : C.muted, alignSelf: 'flex-end' }}
        >{salvandoEntrada ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </div>
  )
}

function EntradaCadernetaRow({ e, hoje, C, inputSt, editandoVencimento, vencimentoInput, setEditandoVencimento, setVencimentoInput, marcarPago, removerEntrada, salvarVencimento, abaterEntrada }) {
  const vencido = !e.pago && e.vencimento && e.vencimento < hoje
  const [modoAbate, setModoAbate] = useState(false)
  const [abateValor, setAbateValor] = useState('')
  const [abateForma, setAbateForma] = useState('dinheiro')

  async function confirmarAbate() {
    const pago = parseFloat(abateValor)
    if (!(pago > 0) || pago > Number(e.valor)) return
    await abaterEntrada(e, pago, abateForma)
    setModoAbate(false)
    setAbateValor('')
    setAbateForma('dinheiro')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '8px',
      padding: '0.75rem 1rem', borderRadius: '10px',
      background: e.pago ? 'rgba(0,200,80,0.06)' : (vencido ? 'rgba(255,50,50,0.1)' : 'rgba(255,100,0,0.08)'),
      border: `1px solid ${e.pago ? 'rgba(0,200,80,0.2)' : (vencido ? 'rgba(255,50,50,0.35)' : 'rgba(255,100,0,0.25)')}`,
      opacity: e.pago ? 0.75 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: e.pago ? 'rgba(15,0,0,0.4)' : '#1A0000', fontSize: '0.95rem', fontWeight: 700, textDecoration: e.pago ? 'line-through' : 'none', lineHeight: 1.3 }}>
            {e.descricao || 'Lançamento'}
          </div>
          <div style={{ color: 'rgba(15,0,0,0.82)', fontSize: '0.82rem', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '3px' }}>
            <span>{e.data || new Date(e.created_at).toLocaleDateString('pt-BR')}</span>
            {e.vencimento
              ? <span style={{ color: vencido ? '#cc2200' : 'rgba(15,0,0,0.6)' }}>📅 vence {new Date(e.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
              : !e.pago && (
                  <button onClick={() => { setEditandoVencimento(e.id); setVencimentoInput('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(15,0,0,0.85)', fontSize: '0.82rem', padding: 0, textDecoration: 'underline', touchAction: 'manipulation' }}>+ vencimento</button>
                )
            }
          </div>
        </div>
        <div style={{ color: e.pago ? 'rgba(255,255,255,0.4)' : '#ff9944', fontWeight: 800, fontSize: '1.05rem', flexShrink: 0, paddingTop: '2px' }}>{fmtMoeda(e.valor)}</div>

        {/* Botões de ação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {!e.pago && e.vencimento && (
            <button onClick={() => { setEditandoVencimento(editandoVencimento === e.id ? null : e.id); setVencimentoInput(e.vencimento || '') }}
              title="Editar vencimento"
              style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,235,235,0.78)', border: '1px solid rgba(255,255,255,0.2)', color: '#1A0000', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
            ><Calendar size={15} /></button>
          )}
          {/* Abater parcial */}
          {!e.pago && (
            <button onClick={() => { setModoAbate(v => !v); setAbateValor('') }} title="Abater pagamento parcial"
              style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', background: modoAbate ? 'rgba(100,100,255,0.25)' : 'rgba(255,235,235,0.78)', border: `1px solid ${modoAbate ? 'rgba(100,100,255,0.5)' : 'rgba(255,255,255,0.2)'}`, color: modoAbate ? '#aaaaff' : '#fff', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
            >$</button>
          )}
          {/* Quitar tudo */}
          <button onClick={() => marcarPago(e.id, !e.pago)} title={e.pago ? 'Desfazer pagamento' : 'Quitar tudo'}
            style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', background: e.pago ? 'rgba(255,255,255,0.08)' : 'rgba(0,200,80,0.2)', border: `1px solid ${e.pago ? 'rgba(255,255,255,0.2)' : 'rgba(0,200,80,0.5)'}`, color: e.pago ? '#fff' : '#00e676', fontSize: '1.1rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
          >{e.pago ? '↩' : '✓'}</button>
          {/* Remover */}
          <button onClick={() => removerEntrada(e.id)} title="Remover"
            style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', color: '#ff8080', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', touchAction: 'manipulation' }}
          >✕</button>
        </div>
      </div>

      {/* Abatimento parcial */}
      {modoAbate && (
        <div style={{ background: 'rgba(100,100,255,0.08)', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ color: 'rgba(15,0,0,0.85)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Valor pago:</span>
            <input
              type="number" value={abateValor} onChange={ev => setAbateValor(ev.target.value)}
              placeholder={`máx ${fmtMoeda(e.valor)}`} min="0.01" step="0.01" max={e.valor}
              style={{ ...inputSt, flex: 1, minWidth: '80px' }}
              autoFocus
            />
            {parseFloat(abateValor) > 0 && parseFloat(abateValor) < Number(e.valor) && (
              <span style={{ color: 'rgba(15,0,0,0.82)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                resta {fmtMoeda(Number(e.valor) - parseFloat(abateValor))}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[['dinheiro','💵'],['pix','📱 Pix'],['debito','Débito'],['credito','Crédito']].map(([val, label]) => (
              <button key={val} onClick={() => setAbateForma(val)} style={{
                padding: '0.3rem 0.6rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                background: abateForma === val ? C.red : 'rgba(255,235,235,0.78)',
                color: abateForma === val ? '#fff' : 'rgba(15,0,0,0.7)',
              }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={confirmarAbate}
              disabled={!(parseFloat(abateValor) > 0) || parseFloat(abateValor) > Number(e.valor)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', border: 'none', background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, color: '#fff', touchAction: 'manipulation' }}
            >✅ Abater</button>
            <button onClick={() => { setModoAbate(false); setAbateValor(''); setAbateForma('dinheiro') }}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,235,235,0.75)', border: '1px solid rgba(255,255,255,0.15)', color: '#1A0000', fontSize: '0.9rem', touchAction: 'manipulation' }}
            >✕</button>
          </div>
        </div>
      )}

      {/* Edição de vencimento */}
      {editandoVencimento === e.id && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="date" value={vencimentoInput} onChange={ev => setVencimentoInput(ev.target.value)} style={{ ...inputSt, flex: 1, colorScheme: 'dark' }} />
          <button onClick={() => salvarVencimento(e.id)} style={{ padding: '0.5rem 0.875rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', border: 'none', background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, color: '#fff', touchAction: 'manipulation' }}>Salvar</button>
          <button onClick={() => { setEditandoVencimento(null); setVencimentoInput('') }} style={{ padding: '0.5rem 0.625rem', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,235,235,0.75)', border: '1px solid rgba(255,255,255,0.15)', color: '#1A0000', fontSize: '0.9rem', touchAction: 'manipulation' }}>✕</button>
        </div>
      )}
    </div>
  )
}

function PaginaCatalogo() {
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [editNome, setEditNome] = useState('')
  const [editPreco, setEditPreco] = useState('')

  useEffect(() => {
    apiFetch('/api/catalogo')
      .then(r => r.json())
      .then(data => { setItens(Array.isArray(data) ? data : []); setCarregando(false) })
      .catch(() => setCarregando(false))
  }, [])

  async function salvar() {
    const n = nome.trim()
    const p = parseFloat(preco)
    if (!n || !(p > 0)) return
    setSalvando(true)
    const res = await apiFetch('/api/catalogo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: n, preco: p }),
    })
    const item = await res.json()
    if (res.ok) {
      setItens(prev => [...prev, item])
      setNome('')
      setPreco('')
    }
    setSalvando(false)
  }

  async function salvarEdicao(id) {
    const n = editNome.trim()
    const p = parseFloat(editPreco)
    if (!n || !(p > 0)) return
    const res = await fetch(`/api/catalogo?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: n, preco: p }),
    })
    if (res.ok) {
      setItens(prev => prev.map(i => i.id === id ? { ...i, nome: n, preco: p } : i))
      setEditandoId(null)
    }
  }

  async function remover(id) {
    await fetch(`/api/catalogo?id=${id}`, { method: 'DELETE' })
    setItens(prev => prev.filter(i => i.id !== id))
  }

  const inputStyle = {
    padding: '0.65rem 0.9rem', borderRadius: 10,
    background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
    color: C.text, fontSize: '0.9rem', outline: 'none',
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem' }}>
        <p style={{ color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 1rem' }}>
          Adicionar item ao catálogo
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && salvar()}
            placeholder="Nome do item"
            style={{ ...inputStyle, flex: 2, minWidth: 160 }}
          />
          <input
            type="number"
            value={preco}
            onChange={e => setPreco(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && salvar()}
            placeholder="Valor (R$)"
            min="0" step="0.01"
            style={{ ...inputStyle, width: 110 }}
          />
          <button
            onClick={salvar}
            disabled={!nome.trim() || !(parseFloat(preco) > 0) || salvando}
            style={{
              padding: '0.65rem 1.25rem', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.88rem',
              background: nome.trim() && parseFloat(preco) > 0 && !salvando
                ? `linear-gradient(145deg, ${C.red}, ${C.redDark})`
                : 'rgba(255,255,255,0.07)',
              color: nome.trim() && parseFloat(preco) > 0 && !salvando ? '#fff' : C.muted,
            }}
          >
            {salvando ? 'Salvando...' : '+ Adicionar'}
          </button>
        </div>
      </div>

      {carregando ? (
        <p style={{ color: C.muted, fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
          Carregando...
        </p>
      ) : itens.length === 0 ? (
        <p style={{ color: C.muted, fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
          Nenhum item cadastrado ainda.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {itens.map(item => (
            <div
              key={item.id}
              style={{
                background: C.card, border: `1px solid ${editandoId === item.id ? 'rgba(245,200,0,0.35)' : C.cardBorder}`,
                borderRadius: 12, padding: '0.75rem 1rem',
              }}
            >
              {editandoId === item.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={editNome}
                    onChange={e => setEditNome(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(item.id); if (e.key === 'Escape') setEditandoId(null) }}
                    autoFocus
                    placeholder="Nome do item"
                    style={{ ...inputStyle, width: '100%', padding: '6px 10px', fontSize: '0.88rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="number"
                      value={editPreco}
                      onChange={e => setEditPreco(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(item.id); if (e.key === 'Escape') setEditandoId(null) }}
                      min="0" step="0.01"
                      placeholder="Valor (R$)"
                      style={{ ...inputStyle, width: 110, padding: '6px 10px', fontSize: '0.88rem' }}
                    />
                    <button
                      onClick={() => salvarEdicao(item.id)}
                      disabled={!editNome.trim() || !(parseFloat(editPreco) > 0)}
                      style={{ flex: 1, background: 'rgba(0,200,80,0.15)', border: '1px solid rgba(0,200,80,0.3)', borderRadius: 8, color: C.success, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditandoId(null)}
                      style={{ background: 'rgba(255,235,235,0.70)', border: 'none', borderRadius: 8, color: C.muted, cursor: 'pointer', padding: '6px 10px', fontSize: '0.85rem' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span style={{ color: C.text, fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{item.nome}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: C.gold, fontWeight: 800, fontSize: '0.95rem', minWidth: 70, textAlign: 'right' }}>
                      R$ {Number(item.preco).toFixed(2)}
                    </span>
                    <button
                      onClick={() => { setEditandoId(item.id); setEditNome(item.nome); setEditPreco(String(item.preco)) }}
                      title="Editar"
                      style={{ background: 'rgba(245,200,0,0.12)', border: '1px solid rgba(245,200,0,0.3)', borderRadius: 8, color: C.gold, cursor: 'pointer', padding: '4px 8px', fontSize: '0.8rem' }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => remover(item.id)}
                      style={{ background: 'rgba(229,57,53,0.15)', border: 'none', borderRadius: 8, color: C.danger, cursor: 'pointer', padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PaginaEstoque() {
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({ nome: '', categoria: 'insumo', quantidade: 0, unidade: 'un', preco_custo: '', alerta_minimo: 5, produto_id: '' })

  const todosProdutos = [
    ...TIPOS_PASTEL.map(t => ({ id: t.id, label: t.nome })),
    ...categorias[0].itens.map(b => ({ id: b.id, label: b.nome })),
  ]

  async function carregar() {
    try {
      const res = await apiFetch('/api/estoque')
      if (res.ok) setItens(await res.json())
    } catch (_) {}
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  async function ajustarQtd(id, delta) {
    const item = itens.find(i => i.id === id)
    if (!item) return
    const nova = Math.max(0, (item.quantidade || 0) + delta)
    try {
      await apiFetch('/api/estoque', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quantidade: nova }),
      })
      setItens(prev => prev.map(i => i.id === id ? { ...i, quantidade: nova } : i))
    } catch (_) {}
  }

  async function excluir(id) {
    if (!window.confirm('Remover este item do estoque?')) return
    try {
      await apiFetch('/api/estoque', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ativo: false }),
      })
      setItens(prev => prev.filter(i => i.id !== id))
    } catch (_) {}
  }

  async function salvarItem() {
    try {
      if (editando) {
        const res = await apiFetch('/api/estoque', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editando, ...form }),
        })
        if (res.ok) {
          setItens(prev => prev.map(i => i.id === editando ? { ...i, ...form } : i))
        }
      } else {
        const res = await apiFetch('/api/estoque', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          const item = await res.json()
          setItens(prev => [item, ...prev])
        }
      }
      fecharModal()
    } catch (_) {}
  }

  function abrirNovo() {
    setEditando(null)
    setForm({ nome: '', categoria: 'insumo', quantidade: 0, unidade: 'un', preco_custo: '', alerta_minimo: 5, produto_id: '' })
    setModalAberto(true)
  }

  function abrirEditar(item) {
    setEditando(item.id)
    setForm({ nome: item.nome, categoria: item.categoria, quantidade: item.quantidade, unidade: item.unidade, preco_custo: item.preco_custo || '', alerta_minimo: item.alerta_minimo, produto_id: item.produto_id || '' })
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    setEditando(null)
  }

  function exportarExcel() {
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(itens.map(i => ({
        Nome: i.nome, Categoria: i.categoria, Quantidade: i.quantidade,
        Unidade: i.unidade, Alerta_Minimo: i.alerta_minimo, Produto_Vinculado: i.produto_id || '',
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Estoque')
      XLSX.writeFile(wb, `estoque_${new Date().toISOString().slice(0, 10)}.xlsx`)
    })
  }

  const [populando, setPopulando] = useState(false)

  async function popularCardapio() {
    if (!window.confirm('Isso vai criar itens de estoque para todas as bebidas e pastéis doces do cardápio. Itens já existentes (mesmo produto_id) serão ignorados. Continuar?')) return
    setPopulando(true)
    const existentes = new Set(itens.map(i => i.produto_id).filter(Boolean))
    const novos = []

    // Bebidas
    for (const beb of categorias[0].itens) {
      if (existentes.has(beb.id)) continue
      novos.push({ nome: beb.nome + (beb.subtitulo ? ` ${beb.subtitulo}` : ''), categoria: 'bebida', quantidade: 0, unidade: 'un', preco_custo: beb.preco, alerta_minimo: 5, produto_id: beb.id })
    }

    // Pastéis doces
    for (const doce of PASTEIS_DOCES) {
      if (existentes.has(doce.id)) continue
      novos.push({ nome: doce.nome, categoria: 'pastel_doce', quantidade: 0, unidade: 'un', preco_custo: doce.preco, alerta_minimo: 5, produto_id: doce.id })
    }

    let criados = 0
    for (const item of novos) {
      try {
        const res = await apiFetch('/api/estoque', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        })
        if (res.ok) criados++
      } catch (_) {}
    }

    if (criados > 0) await carregar()
    setPopulando(false)
    alert(novos.length === 0 ? 'Todos os itens do cardápio já estão no estoque!' : `${criados} itens adicionados ao estoque!`)
  }

  const zerados = itens.filter(i => i.quantidade === 0).length
  const abaixoMin = itens.filter(i => i.quantidade > 0 && i.quantidade <= i.alerta_minimo).length

  const inputStyle = {
    width: '100%', padding: '0.55rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem',
    background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* KPIs estoque */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.875rem' }}>
        <KpiCard icon={Package} label="Total de Itens" valor={itens.length} />
        <KpiCard icon={TrendingUp} label="Abaixo do Minimo" valor={abaixoMin} corSub={abaixoMin > 0 ? C.warning : C.success} sub={abaixoMin > 0 ? 'atencao' : 'ok'} />
        <KpiCard icon={Clock} label="Zerados" valor={zerados} corSub={zerados > 0 ? C.danger : C.success} sub={zerados > 0 ? 'repor urgente' : 'ok'} />
      </div>

      {/* Acoes */}
      <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
        <button
          onClick={abrirNovo}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '0.5rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
            background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, border: 'none', color: '#fff',
          }}
        >
          <Plus size={14} /> Novo item
        </button>
        <button
          onClick={popularCardapio}
          disabled={populando}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '0.5rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
            background: `linear-gradient(145deg, ${C.success}, #00a040)`, border: 'none', color: '#fff',
            opacity: populando ? 0.5 : 1,
          }}
        >
          <Package size={14} /> {populando ? 'Populando...' : 'Popular Cardapio'}
        </button>
        <button
          onClick={exportarExcel}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '0.5rem 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
            background: `linear-gradient(145deg, ${C.gold}, #e6b400)`, border: 'none', color: '#1a1000',
          }}
        >
          Exportar Excel
        </button>
      </div>

      {/* Lista */}
      {carregando ? (
        <p style={{ color: C.muted, textAlign: 'center', padding: '2rem' }}>Carregando...</p>
      ) : itens.length === 0 ? (
        <div style={{
          background: C.card, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${C.cardBorder}`, borderRadius: '16px',
          padding: '3rem', textAlign: 'center', color: C.muted,
        }}>
          <Package size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p style={{ margin: 0 }}>Nenhum item cadastrado</p>
        </div>
      ) : (
        <div style={{
          background: C.card, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${C.cardBorder}`, borderRadius: '16px', overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.cardBorder}` }}>
                  {['Nome', 'Categoria', 'Qtd', 'Valor', 'Unidade', 'Min', 'Status', 'Acoes'].map(h => (
                    <th key={h} style={{ padding: '0.7rem 0.875rem', color: C.muted, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.map(item => {
                  const zerado = item.quantidade === 0
                  const baixo = !zerado && item.quantidade <= item.alerta_minimo
                  const statusCor = zerado ? C.danger : baixo ? C.warning : C.success
                  const statusLabel = zerado ? 'ZERADO' : baixo ? 'BAIXO' : 'NORMAL'
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: `1px solid ${C.cardBorder}`,
                        background: zerado ? 'rgba(200,0,0,0.06)' : baixo ? 'rgba(245,200,0,0.04)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.6rem 0.875rem' }}>
                        <div style={{ color: '#1A0000', fontWeight: 700, fontSize: '0.84rem' }}>{item.nome}</div>
                        {item.produto_id && (
                          <div style={{ color: 'rgba(245,200,0,0.55)', fontSize: '0.67rem' }}>
                            {todosProdutos.find(p => p.id === item.produto_id)?.label || item.produto_id}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.6rem 0.875rem', color: 'rgba(15,0,0,0.80)', fontSize: '0.78rem' }}>{item.categoria}</td>
                      <td style={{ padding: '0.6rem 0.875rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            onClick={() => ajustarQtd(item.id, -1)}
                            style={{ width: '24px', height: '24px', background: 'rgba(200,0,0,0.2)', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#ff7777', fontSize: '0.9rem', fontWeight: 900 }}
                          >−</button>
                          <span style={{ minWidth: '36px', textAlign: 'center', color: statusCor, fontWeight: 900, fontSize: '0.92rem' }}>{item.quantidade}</span>
                          <button
                            onClick={() => ajustarQtd(item.id, 1)}
                            style={{ width: '24px', height: '24px', background: 'rgba(0,200,80,0.15)', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#6aff9e', fontSize: '0.9rem', fontWeight: 900 }}
                          >+</button>
                        </div>
                      </td>
                      <td style={{ padding: '0.6rem 0.875rem', color: C.gold, fontSize: '0.82rem', fontWeight: 700 }}>{item.preco_custo ? fmtMoeda(item.preco_custo) : '—'}</td>
                      <td style={{ padding: '0.6rem 0.875rem', color: 'rgba(15,0,0,0.80)', fontSize: '0.78rem' }}>{item.unidade}</td>
                      <td style={{ padding: '0.6rem 0.875rem', color: 'rgba(15,0,0,0.80)', fontSize: '0.78rem' }}>{item.alerta_minimo}</td>
                      <td style={{ padding: '0.6rem 0.875rem' }}>
                        <span style={{
                          background: statusCor + '20', color: statusCor,
                          border: `1px solid ${statusCor}44`,
                          fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                        }}>
                          {statusLabel}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.875rem' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => abrirEditar(item)}
                            style={{ width: '28px', height: '28px', background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, borderRadius: '6px', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => excluir(item.id)}
                            style={{ width: '28px', height: '28px', background: 'rgba(200,0,0,0.12)', border: '1px solid rgba(200,0,0,0.3)', borderRadius: '6px', cursor: 'pointer', color: '#ff7777', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal adicionar/editar */}
      {modalAberto && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div style={{
            background: 'rgba(30,0,0,0.95)', border: `1px solid ${C.cardBorder}`,
            borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '520px',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ color: C.text, fontWeight: 800, fontSize: '1rem', margin: 0 }}>
                {editando ? 'Editar Item' : 'Novo Item de Estoque'}
              </h2>
              <button onClick={fecharModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {[
                { label: 'Nome', key: 'nome', type: 'text', full: true },
                { label: 'Categoria', key: 'categoria', type: 'text' },
                { label: 'Unidade', key: 'unidade', type: 'text' },
                { label: 'Quantidade inicial', key: 'quantidade', type: 'number' },
                { label: 'Valor (R$)', key: 'preco_custo', type: 'number', step: '0.01' },
                { label: 'Alerta minimo', key: 'alerta_minimo', type: 'number' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : 'span 1' }}>
                  <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    {f.label}
                  </label>
                  <input
                    type={f.type}
                    step={f.step || undefined}
                    value={form[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value) || 0) : e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Produto vinculado
                </label>
                <select
                  value={form.produto_id}
                  onChange={e => setForm(p => ({ ...p, produto_id: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">— nenhum —</option>
                  {todosProdutos.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1.25rem' }}>
              <button
                onClick={salvarItem}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '12px', cursor: 'pointer',
                  background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, border: 'none',
                  color: '#fff', fontSize: '0.9rem', fontWeight: 700,
                }}
              >
                {editando ? 'Salvar alteracoes' : 'Criar item'}
              </button>
              <button
                onClick={fecharModal}
                style={{
                  padding: '0.75rem 1.25rem', borderRadius: '12px', cursor: 'pointer',
                  background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
                  color: C.muted, fontSize: '0.9rem',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA 5: RELATORIOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PaginaRelatorios() {
  const hoje = new Date()
  const hStr = hoje.toISOString().slice(0, 10)
  const mesIni = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`

  const [periodo, setPeriodo] = useState('mes')
  const [dataInicio, setDataInicio] = useState(mesIni)
  const [dataFim, setDataFim] = useState(hStr)
  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(false)

  function getRange() {
    const agora = new Date()
    const h = agora.toISOString().slice(0, 10)
    if (periodo === 'hoje') return { ini: h, fim: h }
    if (periodo === 'ontem') {
      const on = new Date(agora); on.setDate(on.getDate() - 1)
      const s = on.toISOString().slice(0, 10)
      return { ini: s, fim: s }
    }
    if (periodo === 'semana') {
      const ini = new Date(agora); ini.setDate(ini.getDate() - 6)
      return { ini: ini.toISOString().slice(0, 10), fim: h }
    }
    if (periodo === 'mes') {
      const ini = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-01`
      return { ini, fim: h }
    }
    return { ini: dataInicio, fim: dataFim }
  }

  useEffect(() => {
    if (periodo === 'custom' && (!dataInicio || !dataFim)) return
    const { ini, fim } = getRange()
    setCarregando(true)
    const url = ini === fim
      ? `/api/pedido?data=${ini}&tz=-3`
      : `/api/pedido?dataInicio=${ini}&dataFim=${fim}&tz=-3`
    apiFetch(url).then(r => r.json()).then(d => {
      setPedidos(Array.isArray(d) ? d : [])
      setCarregando(false)
    }).catch(() => setCarregando(false))
  }, [periodo, dataInicio, dataFim])
  const total = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const ticket = pedidos.length > 0 ? total / pedidos.length : 0

  const porPagamento = pedidos.reduce((acc, p) => {
    const k = (p.pagamento || 'outro').toLowerCase()
    acc[k] = (acc[k] || 0) + Number(p.total || 0)
    return acc
  }, {})
  const pagMaisUsado = Object.entries(porPagamento).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

  const produtosCount = {}
  pedidos.forEach(p => {
    parseItens(p.itens).forEach(item => {
      const k = item.nome || 'Item'
      produtosCount[k] = (produtosCount[k] || 0) + (item.qtd || item.quantidade || 1)
    })
  })
  const topProdutos = Object.entries(produtosCount).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // Metricas de desconto
  const pedidosComDesconto = pedidos.filter(p => Number(p.desconto_valor) > 0)
  const totalDescontos = pedidosComDesconto.reduce((s, p) => s + (Number(p.desconto_valor) || 0), 0)

  // Grafico linha por dia
  const diasMap = {}
  pedidos.forEach(p => {
    const d = p.created_at?.slice(0, 10) || ''
    if (!d) return
    diasMap[d] = (diasMap[d] || 0) + Number(p.total || 0)
  })
  const dadosDias = Object.entries(diasMap).sort().map(([data, total]) => ({
    data: data.slice(5).replace('-', '/'),
    total: parseFloat(total.toFixed(2)),
  }))

  function exportarExcel() {
    import('xlsx').then(XLSX => {
      const dados = pedidos.map(p => {
        const itens = parseItens(p.itens)
        return {
          Pedido: p.numero, Hora: fmtHora(p.created_at),
          Cliente: p.nome, Telefone: p.telefone,
          Pagamento: p.pagamento, Total: p.total, Status: p.status,
          Itens: itens.map(i => `${i.qtd || 1}x ${i.nome}`).join(' | '),
        }
      })
      const ws = XLSX.utils.json_to_sheet(dados)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
      XLSX.writeFile(wb, `relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`)
    })
  }

  const PERIODOS = [
    { val: 'hoje', label: 'Hoje' },
    { val: 'ontem', label: 'Ontem' },
    { val: 'semana', label: 'Esta Semana' },
    { val: 'mes', label: 'Este Mes' },
    { val: 'custom', label: 'Personalizado' },
  ]

  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
  }

  const pedidosCaderneta = pedidos.filter(p => p.pagamento === 'caderneta')
  const totalCaderneta = pedidosCaderneta.reduce((s, p) => s + Number(p.total || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Filtros periodo */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map(p => (
          <button
            key={p.val}
            onClick={() => setPeriodo(p.val)}
            style={{
              padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
              background: periodo === p.val ? C.red : 'rgba(255,235,235,0.70)',
              border: periodo === p.val ? 'none' : `1px solid ${C.cardBorder}`,
              color: periodo === p.val ? '#fff' : C.muted, transition: 'all 0.15s',
            }}
          >
            {p.label}
          </button>
        ))}
        {carregando && <span style={{ color: C.muted, fontSize: '0.78rem', marginLeft: '4px' }}>carregando...</span>}
        <button
          onClick={exportarExcel}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px',
            padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
            background: `linear-gradient(145deg, ${C.gold}, #e6b400)`, border: 'none', color: '#1a1000',
          }}
        >
          Exportar Excel
        </button>
      </div>

      {periodo === 'custom' && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[['De', dataInicio, setDataInicio], ['Ate', dataFim, setDataFim]].map(([label, val, set]) => (
            <div key={label}>
              <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</label>
              <input
                type="date"
                value={val}
                onChange={e => set(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem',
                  background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
                  color: C.text, outline: 'none',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* KPIs resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.875rem' }}>
        <KpiCard icon={DollarSign} label="Total Faturado" valor={fmtMoeda(total)} sub={`${pedidos.length} pedidos`} />
        <KpiCard icon={Package} label="Total de Pedidos" valor={pedidos.length} />
        <KpiCard icon={TrendingUp} label="Ticket Medio" valor={fmtMoeda(ticket)} />
        <KpiCard icon={BarChart2} label="Pagto Mais Usado" valor={pagMaisUsado.charAt(0).toUpperCase() + pagMaisUsado.slice(1)} />
        {totalDescontos > 0 && (
          <KpiCard icon={Tag} label="Total Descontos" valor={`- ${fmtMoeda(totalDescontos)}`} sub={`${pedidosComDesconto.length} pedido${pedidosComDesconto.length !== 1 ? 's' : ''}`} />
        )}
      </div>

      {/* Detalhamento de descontos */}
      {pedidosComDesconto.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Descontos Concedidos
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pedidosComDesconto.map(p => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.625rem 0.875rem', borderRadius: '10px',
                background: 'rgba(255,82,82,0.06)', border: '1px solid rgba(255,82,82,0.15)',
                flexWrap: 'wrap', gap: '4px',
              }}>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: '0.82rem' }}>
                    #{p.numero} - {p.nome}
                  </div>
                  <div style={{ color: C.muted, fontSize: '0.7rem' }}>
                    {fmtHora(p.created_at)}
                    {p.desconto_tipo === 'porcentagem' && p.desconto_pct ? ` | ${p.desconto_pct}%` : ''}
                    {p.desconto_obs ? ` | ${p.desconto_obs}` : ''}
                  </div>
                </div>
                <span style={{ color: '#ff6b6b', fontWeight: 800, fontSize: '0.9rem' }}>
                  - {fmtMoeda(Number(p.desconto_valor))}
                </span>
              </div>
            ))}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem',
            padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{ color: '#ff6b6b', fontWeight: 800, fontSize: '1rem' }}>
              Total: - {fmtMoeda(totalDescontos)}
            </span>
          </div>
        </div>
      )}

      {/* Grafico linha vendas por dia */}
      {dadosDias.length > 1 && (
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Vendas por Dia
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dadosDias} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRelat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#CC0000" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#CC0000" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="data" tick={{ fill: C.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="total" stroke="#CC0000" strokeWidth={2} fill="url(#gradRelat)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top produtos + Por pagamento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Top Produtos
          </h3>
          {topProdutos.length === 0 ? (
            <p style={{ color: C.muted, fontSize: '0.82rem' }}>Sem dados</p>
          ) : topProdutos.map(([nome, qtd]) => (
            <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '6px' }}>
              <span style={{ color: 'rgba(15,0,0,0.85)', fontSize: '0.82rem', flex: 1 }}>{nome}</span>
              <div style={{
                height: '6px', borderRadius: '3px', background: C.red + '40',
                flex: 2, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: '3px',
                  background: `linear-gradient(90deg, ${C.red}, ${C.gold})`,
                  width: `${Math.round((qtd / (topProdutos[0]?.[1] || 1)) * 100)}%`,
                }} />
              </div>
              <span style={{ color: C.gold, fontWeight: 700, fontSize: '0.82rem', background: 'rgba(245,200,0,0.1)', padding: '1px 8px', borderRadius: '10px', minWidth: '32px', textAlign: 'center' }}>
                {qtd}x
              </span>
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Por Pagamento
          </h3>
          {Object.entries(porPagamento).length === 0 ? (
            <p style={{ color: C.muted, fontSize: '0.82rem' }}>Sem dados</p>
          ) : Object.entries(porPagamento).map(([pag, val]) => (
            <div key={pag} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ color: C.muted, fontSize: '0.82rem', textTransform: 'capitalize' }}>{pag}</span>
              <span style={{ color: C.gold, fontWeight: 700, fontSize: '0.88rem' }}>{fmtMoeda(val)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Relatório Caderneta */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            📒 Pedidos Anotados (Caderneta)
          </h3>
          {pedidosCaderneta.length > 0 && (
            <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.9rem' }}>
              {pedidosCaderneta.length} pedido{pedidosCaderneta.length !== 1 ? 's' : ''} · {fmtMoeda(totalCaderneta)} a receber
            </span>
          )}
        </div>
        {pedidosCaderneta.length === 0 ? (
          <p style={{ color: C.muted, fontSize: '0.82rem' }}>Nenhum pedido anotado no período.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pedidosCaderneta.map(p => {
              const itens = parseItens(p.itens)
              return (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '0.625rem 0.875rem', borderRadius: '10px', gap: '0.5rem',
                  background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ color: C.text, fontWeight: 700, fontSize: '0.85rem' }}>
                      #{p.numero} — {p.nome}
                    </div>
                    <div style={{ color: C.muted, fontSize: '0.72rem', marginTop: '2px' }}>
                      {fmtHora(p.created_at)}
                      {p.telefone ? ` · ${p.telefone}` : ''}
                    </div>
                    {itens.length > 0 && (
                      <div style={{ color: 'rgba(15,0,0,0.6)', fontSize: '0.72rem', marginTop: '3px' }}>
                        {itens.map(i => `${i.qtd || 1}x ${i.nome}`).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.95rem' }}>
                      {fmtMoeda(Number(p.total))}
                    </div>
                    <div style={{ color: C.muted, fontSize: '0.7rem', marginTop: '2px', textTransform: 'capitalize' }}>
                      {p.status}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA: WHATSAPP BOT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PaginaWhatsApp() {
  const [status, setStatus] = useState(null) // { connected, exists, qrcode, state }
  const [sessoes, setSessoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [msgTexto, setMsgTexto] = useState('')
  const [msgTelefone, setMsgTelefone] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [modoBot, setModoBot] = useState('auto') // 'ligado' | 'desligado' | 'auto'
  const [salvandoBot, setSalvandoBot] = useState(false)
  const [configLoja, setConfigLoja] = useState(null)
  const timerRef = useRef(null)

  // Carregar estado do bot + config da loja
  useEffect(() => {
    apiFetch('/api/cardapio-state').then(r => r.json()).then(data => {
      if (data) {
        setConfigLoja(data)
        if (data.bot_ativo) setModoBot(data.bot_ativo)
      }
    }).catch(() => {})
  }, [])

  async function mudarModoBot(novo) {
    setSalvandoBot(true)
    try {
      await apiFetch('/api/cardapio-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_ativo: novo }),
      })
      setModoBot(novo)
    } catch {}
    setSalvandoBot(false)
  }

  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
  }

  async function carregarStatus(comQR = false) {
    try {
      const url = comQR ? '/api/whatsapp/instance?qr=1' : '/api/whatsapp/instance'
      const res = await fetch(url)
      const data = await res.json()
      setStatus(prev => {
        if (data.connected) return data
        // Sempre usar QR novo — QR antigo já expirou (dura ~30s)
        return { ...data, qrcode: data.qrcode || null }
      })
    } catch { setStatus({ connected: false, exists: false, error: true }) }
  }

  async function carregarSessoes() {
    try {
      const res = await apiFetch('/api/whatsapp/sessoes')
      const data = await res.json()
      if (Array.isArray(data)) setSessoes(data)
    } catch {}
  }

  async function criarInstancia() {
    setCriando(true)
    try {
      const res = await apiFetch('/api/whatsapp/instance', { method: 'POST' })
      const data = await res.json()
      setStatus(prev => ({ ...prev, ...data, exists: true, connected: false }))
      // Buscar QR code imediatamente
      await carregarStatus(true)
      iniciarPollingQR()
    } catch {}
    setCriando(false)
  }

  async function desconectar() {
    if (!window.confirm('Desconectar o WhatsApp?')) return
    await apiFetch('/api/whatsapp/instance?action=logout', { method: 'DELETE' })
    await carregarStatus(false)
  }

  async function toggleHumano(telefone, ativar) {
    await apiFetch('/api/whatsapp/sessoes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone, humano_ativo: ativar }),
    })
    await carregarSessoes()
  }

  async function resetarSessao(telefone) {
    if (!window.confirm(`Resetar sessão de ${telefone}?`)) return
    await fetch(`/api/whatsapp/sessoes?telefone=${telefone}`, { method: 'DELETE' })
    await carregarSessoes()
  }

  async function enviarMsgManual() {
    if (!msgTelefone || !msgTexto) return
    setEnviando(true)
    await apiFetch('/api/whatsapp/sessoes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone: msgTelefone, mensagem: msgTexto }),
    })
    setMsgTexto('')
    setEnviando(false)
    await carregarSessoes()
  }

  // Polling leve — só status, sem QR (usado no mount e quando conectado)
  function iniciarPolling() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(async () => {
      await carregarStatus(false)
      await carregarSessoes()
    }, 15000)
  }

  // Polling com QR — usado enquanto aguarda conexão (QR expira em ~30s)
  function iniciarPollingQR() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(async () => {
      await carregarStatus(true)
      await carregarSessoes()
    }, 4000)
  }

  useEffect(() => {
    carregarStatus(false).then(() => setLoading(false))
    carregarSessoes()
    iniciarPolling()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // Quando conectar, parar polling de QR e usar polling lento
  useEffect(() => {
    if (status?.connected) {
      iniciarPolling()
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status?.connected])

  if (loading) return <p style={{ color: C.muted, textAlign: 'center', padding: '3rem' }}>Carregando...</p>

  const ESTADO_LABEL = {
    novo: { label: 'Novo', cor: C.muted },
    saudacao: { label: 'Saudação enviada', cor: '#2196F3' },
    fora_horario: { label: 'Fora do horário', cor: C.warning },
    perguntou_duvida: { label: 'Perguntou dúvida', cor: '#FF9800' },
    humano: { label: 'Atendente', cor: C.danger },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── STATUS DA CONEXÃO ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '1rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bot size={20} /> Conexão WhatsApp
          </h3>
          <button onClick={() => { carregarStatus(); carregarSessoes() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
            <RefreshCw size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{
            width: '14px', height: '14px', borderRadius: '50%',
            background: status?.connected ? C.success : '#FF5252',
            boxShadow: status?.connected ? '0 0 10px rgba(0,230,118,0.5)' : '0 0 10px rgba(255,82,82,0.5)',
            animation: !status?.connected && status?.exists ? 'pulse 2s infinite' : 'none',
          }} />
          <div>
            <p style={{ color: C.text, fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>
              {status?.connected ? 'Conectado' : status?.exists ? 'Desconectado' : 'Instância não criada'}
            </p>
            <p style={{ color: C.muted, fontSize: '0.75rem', margin: '2px 0 0' }}>
              {status?.connected
                ? (modoBot === 'desligado' ? 'Conectado mas bot está DESLIGADO' : modoBot === 'auto' ? 'Bot em modo automático (segue horário da loja)' : 'Bot ativo e respondendo mensagens')
                : 'Escaneie o QR Code para conectar'}
            </p>
          </div>
        </div>

        {/* Modo do Bot — sempre visível */}
        {(() => {
          const modos = [
            { id: 'ligado', label: 'Ligado', icon: '🟢', cor: C.success, desc: 'Sempre respondendo' },
            { id: 'auto', label: 'Auto', icon: '⏰', cor: C.gold, desc: `Segue horário: ${configLoja?.horario_abertura || '?'}–${configLoja?.horario_fechamento || '?'}` },
            { id: 'desligado', label: 'Desligado', icon: '🔴', cor: '#FF5252', desc: 'Não responde ninguém' },
          ]
          return (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: C.muted, fontSize: '0.72rem', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 700 }}>
                Modo do Bot
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {modos.map(m => {
                  const ativo = modoBot === m.id
                  return (
                    <div
                      key={m.id}
                      onClick={salvandoBot ? undefined : () => mudarModoBot(m.id)}
                      style={{
                        padding: '0.75rem 0.5rem', borderRadius: '12px', textAlign: 'center',
                        cursor: salvandoBot ? 'wait' : 'pointer',
                        background: ativo ? `${m.cor}18` : 'rgba(255,255,255,0.04)',
                        border: `2px solid ${ativo ? m.cor : 'rgba(255,235,235,0.75)'}`,
                        opacity: salvandoBot ? 0.5 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: '1.3rem', marginBottom: '4px' }}>{m.icon}</div>
                      <div style={{ color: ativo ? m.cor : C.text, fontWeight: 800, fontSize: '0.82rem' }}>{m.label}</div>
                      <div style={{ color: C.muted, fontSize: '0.62rem', marginTop: '2px', lineHeight: 1.3 }}>{m.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Botões de ação */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!status?.exists && (
            <button
              onClick={criarInstancia}
              disabled={criando}
              className="btn-brand"
              style={{ padding: '0.6rem 1.2rem', borderRadius: '10px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Power size={16} /> {criando ? 'Criando...' : 'Criar instância'}
            </button>
          )}

          {status?.exists && !status?.connected && (
            <button
              onClick={criarInstancia}
              disabled={criando}
              style={{
                padding: '0.6rem 1.2rem', borderRadius: '10px', fontSize: '0.85rem',
                background: 'rgba(0,230,118,0.15)', border: '1px solid rgba(0,230,118,0.3)',
                color: C.success, cursor: 'pointer', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <QrCode size={16} /> {criando ? 'Gerando QR...' : 'Gerar QR Code'}
            </button>
          )}

          {status?.connected && (
            <button
              onClick={desconectar}
              style={{
                padding: '0.6rem 1.2rem', borderRadius: '10px', fontSize: '0.85rem',
                background: 'rgba(255,82,82,0.12)', border: '1px solid rgba(255,82,82,0.3)',
                color: '#FF5252', cursor: 'pointer', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <Power size={16} /> Desconectar
            </button>
          )}
        </div>

        {/* QR CODE */}
        {!status?.connected && typeof status?.qrcode === 'string' && status.qrcode.length > 10 && (
          <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
            <p style={{ color: C.gold, fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Escaneie com o WhatsApp da loja:
            </p>
            <div style={{
              display: 'inline-block', padding: '1rem', background: '#fff', borderRadius: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}>
              {status.qrcode.startsWith('data:image') ? (
                <img src={status.qrcode} alt="QR Code" style={{ width: '280px', height: '280px' }} />
              ) : (
                <img src={`data:image/png;base64,${status.qrcode}`} alt="QR Code" style={{ width: '280px', height: '280px' }} onError={e => { e.target.style.display = 'none' }} />
              )}
            </div>
            <p style={{ color: C.muted, fontSize: '0.72rem', marginTop: '0.5rem' }}>
              O QR Code atualiza a cada 30 segundos. Escaneie rapidamente.
            </p>
          </div>
        )}
        {!status?.connected && status?.exists && !status?.qrcode && !status?.error && (
          <p style={{ color: C.muted, fontSize: '0.8rem', marginTop: '1rem', textAlign: 'center' }}>
            Clique em "Gerar QR Code" para conectar.
          </p>
        )}
        {status?.error && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '10px', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)' }}>
            <p style={{ color: '#FF5252', fontSize: '0.82rem', margin: 0, fontWeight: 700 }}>
              ⚠️ Não foi possível conectar à Evolution API. Verifique se a URL e API Key estão configuradas nas variáveis de ambiente.
            </p>
          </div>
        )}
      </div>

      {/* ── ENVIAR MENSAGEM MANUAL ── */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.95rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Send size={18} /> Enviar Mensagem
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <input
            type="text"
            placeholder="Telefone (5532...)"
            value={msgTelefone}
            onChange={e => setMsgTelefone(e.target.value)}
            style={{
              flex: '0 0 180px', padding: '0.55rem 0.75rem', borderRadius: '10px',
              background: 'rgba(255,235,235,0.70)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#1A0000', fontSize: '0.85rem', outline: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Mensagem..."
            value={msgTexto}
            onChange={e => setMsgTexto(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && enviarMsgManual()}
            style={{
              flex: 1, minWidth: '200px', padding: '0.55rem 0.75rem', borderRadius: '10px',
              background: 'rgba(255,235,235,0.70)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#1A0000', fontSize: '0.85rem', outline: 'none',
            }}
          />
          <button
            onClick={enviarMsgManual}
            disabled={enviando || !msgTexto || !msgTelefone}
            style={{
              padding: '0.55rem 1rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700,
              background: 'rgba(0,230,118,0.15)', border: '1px solid rgba(0,230,118,0.3)',
              color: C.success, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              opacity: (!msgTexto || !msgTelefone) ? 0.4 : 1,
            }}
          >
            <Send size={14} /> {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
        <p style={{ color: C.muted, fontSize: '0.7rem', margin: 0 }}>
          Ao enviar manualmente, o bot será pausado para este contato (modo atendente).
        </p>
      </div>

      {/* ── SESSÕES ATIVAS ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.95rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} /> Conversas ({sessoes.length})
          </h3>
        </div>

        {sessoes.length === 0 ? (
          <p style={{ color: C.muted, textAlign: 'center', padding: '2rem 0', fontSize: '0.85rem' }}>Nenhuma conversa registrada</p>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['Contato', 'Telefone', 'Estado', 'Modo', 'Última atividade', 'Ações'].map(h => (
                    <th key={h} style={{
                      padding: '0.55rem 0.75rem', color: 'rgba(15,0,0,0.82)', fontSize: '0.7rem',
                      fontWeight: 700, textTransform: 'uppercase', textAlign: 'left', whiteSpace: 'nowrap',
                      position: 'sticky', top: 0, background: 'rgba(255,240,240,0.95)', zIndex: 1,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessoes.map(s => {
                  const est = ESTADO_LABEL[s.estado] || { label: s.estado, cor: C.muted }
                  const atualizacao = s.updated_at ? new Date(s.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', color: '#1A0000', fontSize: '0.82rem', fontWeight: 600 }}>
                        {s.nome_contato || '-'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: C.muted, fontSize: '0.78rem', fontFamily: 'monospace' }}>
                        {s.telefone}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                          background: `${est.cor}22`, color: est.cor, border: `1px solid ${est.cor}44`,
                        }}>
                          {est.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                          background: s.humano_ativo ? 'rgba(255,152,0,0.15)' : 'rgba(0,230,118,0.15)',
                          color: s.humano_ativo ? '#FF9800' : C.success,
                          border: `1px solid ${s.humano_ativo ? 'rgba(255,152,0,0.3)' : 'rgba(0,230,118,0.3)'}`,
                        }}>
                          {s.humano_ativo ? '👤 Humano' : '🤖 Bot'}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: C.muted, fontSize: '0.75rem' }}>
                        {atualizacao}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {/* Assumir / Devolver */}
                          <button
                            onClick={() => toggleHumano(s.telefone, !s.humano_ativo)}
                            title={s.humano_ativo ? 'Devolver para bot' : 'Assumir atendimento'}
                            style={{
                              padding: '4px 10px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 700,
                              background: s.humano_ativo ? 'rgba(0,230,118,0.12)' : 'rgba(255,152,0,0.12)',
                              border: `1px solid ${s.humano_ativo ? 'rgba(0,230,118,0.3)' : 'rgba(255,152,0,0.3)'}`,
                              color: s.humano_ativo ? C.success : '#FF9800',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                            }}
                          >
                            {s.humano_ativo ? <><Bot size={12} /> Bot</> : <><UserCheck size={12} /> Assumir</>}
                          </button>
                          {/* Responder rápido */}
                          <button
                            onClick={() => { setMsgTelefone(s.telefone); document.querySelector('input[placeholder="Mensagem..."]')?.focus() }}
                            title="Responder"
                            style={{
                              padding: '4px 8px', borderRadius: '8px',
                              background: 'rgba(245,200,0,0.12)', border: '1px solid rgba(245,200,0,0.3)',
                              color: C.gold, cursor: 'pointer', display: 'flex', alignItems: 'center',
                            }}
                          >
                            <Send size={12} />
                          </button>
                          {/* Resetar */}
                          <button
                            onClick={() => resetarSessao(s.telefone)}
                            title="Resetar sessão"
                            style={{
                              padding: '4px 8px', borderRadius: '8px',
                              background: 'rgba(255,82,82,0.12)', border: '1px solid rgba(255,82,82,0.3)',
                              color: '#FF5252', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── INFO DO BOT ── */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.95rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Fluxo do Bot
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { icon: '1️⃣', text: 'Cliente manda msg → Saudação + link do cardápio' },
            { icon: '2️⃣', text: 'Manda de novo → Link + "Tem alguma dúvida?"' },
            { icon: '3️⃣', text: 'Manda de novo → Direciona para atendente' },
            { icon: '🔔', text: 'Pedido confirmado → Envia confirmação + PIX (se aplicável)' },
            { icon: '🔥', text: 'Em produção → Notifica cliente' },
            { icon: '✅', text: 'Pronto → Notifica + endereço da loja' },
            { icon: '⏰', text: 'Fora do horário → Informa dias/horários de funcionamento' },
            { icon: '👤', text: 'Humano responde → Bot para automaticamente' },
            { icon: '💰', text: 'Cliente pede PIX → Envia chave + copia e cola' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.4rem 0' }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ color: 'rgba(15,0,0,0.85)', fontSize: '0.82rem' }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA 6: CONFIGURACOES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PaginaConfiguracoes({ autoprint, onToggleAutoprint, onTestarImpressao, config, onSalvar }) {
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [msgSenha, setMsgSenha] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk] = useState(false)

  // QZ Tray
  const [qzConectado, setQzConectado] = useState(false)
  const [qzImpressoras, setQzImpressoras] = useState([])
  const [qzSelecionada, setQzSelecionada] = useState(() => getNomeImpressoraSalva())
  const [qzCarregando, setQzCarregando] = useState(false)
  const [qzMsg, setQzMsg] = useState('')

  async function detectarQZ() {
    setQzCarregando(true)
    setQzMsg('')
    try {
      const ok = await verificarQZConectado()
      setQzConectado(ok)
      if (ok) {
        const lista = await listarImpressoras()
        setQzImpressoras(lista)
        setQzMsg(`${lista.length} impressora${lista.length !== 1 ? 's' : ''} encontrada${lista.length !== 1 ? 's' : ''}`)
        // auto-selecionar: salva > "IMPRESSORA PEDIDOS" > única
        const salva = getNomeImpressoraSalva()
        const pedidos = lista.find(p => p.toUpperCase().includes('IMPRESSORA PEDIDOS'))
        if (salva && lista.includes(salva)) {
          setQzSelecionada(salva)
          iniciarKeepAlive(salva)
        } else if (pedidos) {
          setQzSelecionada(pedidos)
          salvarNomeImpressora(pedidos)
          iniciarKeepAlive(pedidos)
        } else if (lista.length === 1) {
          setQzSelecionada(lista[0])
          salvarNomeImpressora(lista[0])
          iniciarKeepAlive(lista[0])
        }
      } else {
        setQzMsg('QZ Tray não detectado. Verifique se está rodando.')
      }
    } catch (e) {
      setQzMsg('Erro ao conectar: ' + (e.message || 'QZ Tray não encontrado'))
    }
    setQzCarregando(false)
  }

  useEffect(() => { detectarQZ() }, [])

  const [form, setForm] = useState({
    status: config?.status || 'auto',
    horario_abertura: config?.horario_abertura || CONFIG.horarioAbertura,
    horario_fechamento: config?.horario_fechamento || CONFIG.horarioFechamento,
    whatsapp: config?.whatsapp || CONFIG.whatsappNumero,
    pix_chave: config?.pix_chave || '',
    pix_tipo: config?.pix_tipo || 'Telefone',
    pix_nome: config?.pix_nome || '',
    endereco_loja: config?.endereco_loja || '',
    dias_funcionamento: config?.dias_funcionamento || [0, 1, 2, 3, 4, 5, 6],
    entrega_ativa: config?.entrega_ativa ?? false,
    taxa_entrega: config?.taxa_entrega ?? 0,
    senha_desconto: config?.senha_desconto || '',
  })

  useEffect(() => {
    if (!config) return
    setForm(f => ({
      ...f,
      status: config.status ?? f.status,
      horario_abertura: config.horario_abertura ?? f.horario_abertura,
      horario_fechamento: config.horario_fechamento ?? f.horario_fechamento,
      whatsapp: config.whatsapp ?? f.whatsapp,
      pix_chave: config.pix_chave ?? f.pix_chave,
      pix_tipo: config.pix_tipo ?? f.pix_tipo,
      pix_nome: config.pix_nome ?? f.pix_nome,
      endereco_loja: config.endereco_loja ?? f.endereco_loja,
      dias_funcionamento: config.dias_funcionamento ?? f.dias_funcionamento,
      entrega_ativa: config.entrega_ativa ?? f.entrega_ativa,
      taxa_entrega: config.taxa_entrega ?? f.taxa_entrega,
      senha_desconto: config.senha_desconto ?? f.senha_desconto,
    }))
  }, [config])

  const [erroSalvar, setErroSalvar] = useState('')

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function salvar() {
    if (!onSalvar) return
    setSalvando(true)
    setErroSalvar('')
    try {
      await onSalvar(form)
      setOk(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setTimeout(() => setOk(false), 2500)
    } catch (e) {
      setErroSalvar(e.message || 'Erro ao salvar')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setTimeout(() => setErroSalvar(''), 5000)
    }
    setSalvando(false)
  }

  function salvarSenha() {
    if (!novaSenha) return setMsgSenha({ tipo: 'erro', texto: 'Digite a nova senha' })
    if (novaSenha !== confirmarSenha) return setMsgSenha({ tipo: 'erro', texto: 'As senhas não coincidem' })
    setMsgSenha({ tipo: 'ok', texto: 'Anote a nova senha e atualize no sistema' })
    setNovaSenha('')
    setConfirmarSenha('')
    setTimeout(() => setMsgSenha(null), 4000)
  }

  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
    marginBottom: '1rem',
  }

  const inputStyle = {
    width: '100%', padding: '0.55rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem',
    background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
  }

  const STATUS_OPCOES = [
    { val: 'auto',    label: 'Auto (horário)', icon: '⚙️' },
    { val: 'aberta',  label: 'Aberta',         icon: '🟢' },
    { val: 'fechada', label: 'Fechada',         icon: '🔴' },
  ]

  return (
    <div style={{ maxWidth: '720px' }}>

      {/* Status da Loja */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Status da Loja
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {STATUS_OPCOES.map(o => (
            <button key={o.val} onClick={() => setF('status', o.val)} style={{
              flex: 1, padding: '0.75rem', borderRadius: '12px', cursor: 'pointer',
              background: form.status === o.val ? 'rgba(229,57,53,0.25)' : 'rgba(255,255,255,0.04)',
              border: form.status === o.val ? `2px solid ${C.red}` : `1px solid ${C.cardBorder}`,
              color: form.status === o.val ? C.text : C.muted,
              fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s',
            }}>
              {o.icon} {o.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Abertura</label>
            <input type="time" value={form.horario_abertura} onChange={e => setF('horario_abertura', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Fechamento</label>
            <input type="time" value={form.horario_fechamento} onChange={e => setF('horario_fechamento', e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>WhatsApp (com DDI)</label>
          <input type="text" value={form.whatsapp} onChange={e => setF('whatsapp', e.target.value)} placeholder="5532999999999" style={inputStyle} />
        </div>

        {/* Dias de Funcionamento */}
        <div style={{ marginTop: '1rem' }}>
          <label style={labelStyle}>Dias de Funcionamento</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
            {[
              { val: 0, label: 'Dom' },
              { val: 1, label: 'Seg' },
              { val: 2, label: 'Ter' },
              { val: 3, label: 'Qua' },
              { val: 4, label: 'Qui' },
              { val: 5, label: 'Sex' },
              { val: 6, label: 'Sáb' },
            ].map(dia => {
              const ativo = (form.dias_funcionamento || []).includes(dia.val)
              return (
                <button
                  key={dia.val}
                  onClick={() => {
                    const dias = form.dias_funcionamento || []
                    const novos = ativo ? dias.filter(d => d !== dia.val) : [...dias, dia.val]
                    setF('dias_funcionamento', novos)
                  }}
                  style={{
                    padding: '0.55rem 0.875rem', borderRadius: '10px', cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 700, border: 'none',
                    background: ativo ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.70)',
                    color: ativo ? '#fff' : C.muted,
                    transition: 'all 0.12s',
                  }}
                >
                  {dia.label}
                </button>
              )
            })}
          </div>
          <p style={{ color: C.muted, fontSize: '0.71rem', margin: '6px 0 0', fontStyle: 'italic' }}>
            Nos dias nao selecionados, o cardapio mostrara a loja como fechada.
          </p>
        </div>
      </div>

      {/* Endereço */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Endereço de Retirada
        </h3>
        <input
          type="text"
          value={form.endereco_loja}
          onChange={e => setF('endereco_loja', e.target.value)}
          placeholder="Ex: Rua das Flores, 123 — Centro"
          style={inputStyle}
        />
        <p style={{ color: C.muted, fontSize: '0.71rem', margin: '4px 0 0', fontStyle: 'italic' }}>
          Exibido para o cliente na tela de finalização do pedido.
        </p>
      </div>

      {/* Senha de Desconto */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Senha de Desconto
        </h3>
        <p style={{ color: C.muted, fontSize: '0.75rem', margin: '0 0 0.625rem' }}>
          Senha exigida para aplicar descontos no balcao e caixa.
        </p>
        <input
          type="text"
          value={form.senha_desconto}
          onChange={e => setF('senha_desconto', e.target.value)}
          placeholder="Senha para desconto"
          style={{ ...inputStyle, maxWidth: '200px' }}
        />
      </div>

      {/* Entrega / Delivery */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Entrega / Delivery
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <button
            onClick={() => setF('entrega_ativa', !form.entrega_ativa)}
            style={{
              width: '52px', height: '28px', borderRadius: '14px', cursor: 'pointer',
              background: form.entrega_ativa ? C.success : 'rgba(255,235,235,0.80)',
              border: 'none', position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
              position: 'absolute', top: '3px',
              left: form.entrega_ativa ? '27px' : '3px',
              transition: 'left 0.2s',
            }} />
          </button>
          <span style={{ color: form.entrega_ativa ? C.success : C.muted, fontWeight: 700, fontSize: '0.88rem' }}>
            {form.entrega_ativa ? 'Entrega ATIVADA' : 'Entrega DESATIVADA'}
          </span>
        </div>
        {form.entrega_ativa && (
          <div>
            <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Taxa de entrega (R$)
            </label>
            <input
              type="number"
              step="0.50"
              value={form.taxa_entrega}
              onChange={e => setF('taxa_entrega', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              style={{ ...inputStyle, maxWidth: '160px' }}
            />
          </div>
        )}
        <p style={{ color: C.muted, fontSize: '0.71rem', margin: '8px 0 0', fontStyle: 'italic' }}>
          Quando desativada, a opção de entrega não aparece para o cliente.
        </p>
      </div>

      {/* Pix */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 0.875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Configuração Pix
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Chave Pix</label>
            <input type="text" value={form.pix_chave} onChange={e => setF('pix_chave', e.target.value)} placeholder="Telefone, CPF, e-mail..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Tipo da Chave</label>
            <select value={form.pix_tipo} onChange={e => setF('pix_tipo', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {['Telefone', 'CPF', 'CNPJ', 'Email', 'Aleatória'].map(t => (
                <option key={t} value={t} style={{ background: '#1a0000' }}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Nome do Favorecido</label>
          <input type="text" value={form.pix_nome} onChange={e => setF('pix_nome', e.target.value)} placeholder="Nome que aparece no Pix" style={inputStyle} />
        </div>
      </div>

      {/* Botão salvar */}
      <div style={{ position: 'sticky', bottom: '1rem', zIndex: 10, marginBottom: '1.5rem' }}>
        {erroSalvar && (
          <div style={{ marginBottom: '0.5rem', padding: '0.625rem 1rem', borderRadius: '10px', background: 'rgba(200,0,0,0.2)', border: '1px solid rgba(200,0,0,0.5)', color: '#ff6666', fontSize: '0.82rem', fontWeight: 700 }}>
            {erroSalvar}
          </div>
        )}
        <button onClick={salvar} disabled={salvando} style={{
          width: '100%', padding: '1rem', borderRadius: '14px', cursor: salvando ? 'not-allowed' : 'pointer',
          fontSize: '1rem', fontWeight: 800, border: 'none',
          background: ok ? 'linear-gradient(145deg,#00c853,#00a844)' : `linear-gradient(145deg, ${C.gold}, #e6b400)`,
          color: ok ? '#fff' : '#1a1000',
          boxShadow: `0 6px 20px ${ok ? 'rgba(0,200,80,0.4)' : 'rgba(245,200,0,0.3)'}`,
          opacity: salvando ? 0.7 : 1, transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        }}>
          {salvando ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : ok ? <Check size={16} /> : null}
          {salvando ? 'Salvando...' : ok ? 'Salvo!' : 'Salvar Configurações'}
        </button>
      </div>

      {/* Impressao */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Impressao
        </h3>

        {/* Auto-print toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <div style={{ color: C.text, fontSize: '0.88rem', fontWeight: 600 }}>Impressao automatica</div>
            <div style={{ color: C.muted, fontSize: '0.75rem', marginTop: '2px' }}>Imprime ao chegar novo pedido</div>
          </div>
          <div
            onClick={onToggleAutoprint}
            style={{
              width: '48px', height: '26px', borderRadius: '13px', cursor: 'pointer',
              background: autoprint ? C.success : 'rgba(255,255,255,0.15)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: '3px',
              left: autoprint ? '25px' : '3px',
              width: '20px', height: '20px', borderRadius: '10px',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }} />
          </div>
        </div>

        {/* QZ Tray - Impressora Térmica */}
        <div style={{
          padding: '1rem', borderRadius: '12px', marginBottom: '1rem',
          background: qzConectado ? 'rgba(0,200,80,0.06)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${qzConectado ? 'rgba(0,200,80,0.2)' : C.cardBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Printer size={16} color={qzConectado ? C.success : C.muted} />
              <span style={{ color: C.text, fontSize: '0.85rem', fontWeight: 700 }}>QZ Tray</span>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                background: qzConectado ? 'rgba(0,200,80,0.15)' : 'rgba(255,100,100,0.15)',
                color: qzConectado ? C.success : '#ff7777',
                border: `1px solid ${qzConectado ? 'rgba(0,200,80,0.3)' : 'rgba(255,100,100,0.3)'}`,
              }}>
                {qzConectado ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <button
              onClick={detectarQZ}
              disabled={qzCarregando}
              style={{
                padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.muted,
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <RefreshCw size={11} style={qzCarregando ? { animation: 'spin 1s linear infinite' } : {}} />
              {qzCarregando ? 'Detectando...' : 'Detectar'}
            </button>
          </div>

          {qzMsg && (
            <div style={{ color: C.muted, fontSize: '0.75rem', marginBottom: '0.5rem' }}>{qzMsg}</div>
          )}

          {qzConectado && qzImpressoras.length > 0 && (
            <div>
              <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                Impressora
              </label>
              <select
                value={qzSelecionada}
                onChange={e => { setQzSelecionada(e.target.value); salvarNomeImpressora(e.target.value); iniciarKeepAlive(e.target.value) }}
                style={{
                  width: '100%', padding: '0.55rem 0.875rem', borderRadius: '10px', fontSize: '0.85rem',
                  background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
                  color: C.text, outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="" style={{ background: '#1a1a2e' }}>Selecione...</option>
                {qzImpressoras.map(p => (
                  <option key={p} value={p} style={{ background: '#1a1a2e' }}>{p}</option>
                ))}
              </select>
              {qzSelecionada && (
                <div style={{ marginTop: '6px', color: C.success, fontSize: '0.72rem', fontWeight: 600 }}>
                  ✓ Impressora selecionada: {qzSelecionada}
                </div>
              )}
            </div>
          )}

          {!qzConectado && (
            <div style={{ color: C.muted, fontSize: '0.75rem', lineHeight: 1.4 }}>
              Certifique-se que o QZ Tray está aberto no computador.
              <br />A impressão será feita diretamente na térmica 58mm sem abrir diálogo.
            </div>
          )}
        </div>

        <button
          onClick={onTestarImpressao}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '0.6rem 1.25rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
            background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text,
          }}
        >
          <Printer size={14} /> Testar impressao
        </button>
      </div>

      {/* Seguranca */}
      <div style={cardStyle}>
        <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Seguranca
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Nova senha
            </label>
            <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} style={inputStyle} placeholder="Nova senha" />
          </div>
          <div>
            <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Confirmar senha
            </label>
            <input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} style={inputStyle} placeholder="Repita a senha" />
          </div>
          {msgSenha && (
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: msgSenha.tipo === 'ok' ? C.success : '#FF7777' }}>
              {msgSenha.texto}
            </p>
          )}
          <button
            onClick={salvarSenha}
            style={{
              padding: '0.6rem 1.25rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
              background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, border: 'none', color: '#fff',
              alignSelf: 'flex-start',
            }}
          >
            Alterar senha
          </button>
        </div>
      </div>

    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA 7: VENDA NO BALCÃO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ModalSaboresBalcao({ tipo, onFechar, onAdicionar }) {
  const [sabores, setSabores] = useState([])
  const [adicionais, setAdicionais] = useState([])
  const [obs, setObs] = useState('')

  if (!tipo) return null

  const saboresLista = tipo.tipo === 'doce' ? SABORES_DOCES : SABORES_SALGADOS
  const maxAd = tipo.maxAdicionais || 0

  function toggleSabor(s) {
    setSabores(prev =>
      prev.includes(s)
        ? prev.filter(x => x !== s)
        : prev.length < tipo.maxSabores ? [...prev, s] : prev
    )
  }

  function toggleAd(a) {
    setAdicionais(prev =>
      prev.includes(a)
        ? prev.filter(x => x !== a)
        : prev.length < maxAd ? [...prev, a] : prev
    )
  }

  function confirmar() {
    if (sabores.length === 0) return
    onAdicionar({
      chave: `${tipo.id}-${Date.now()}`,
      tipoId: tipo.id,
      nome: tipo.nome,
      preco: tipo.preco,
      qtd: 1,
      sabores,
      adicionais,
      observacao: obs,
    })
    onFechar()
  }

  const inputStyle = {
    width: '100%', padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem',
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: 'rgba(24,0,0,0.98)', border: `1px solid ${C.cardBorder}`,
        borderRadius: '20px', padding: '1.5rem', width: '100%', maxWidth: '480px',
        maxHeight: '90vh', overflowY: 'auto',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>{tipo.nome}</div>
            <div style={{ color: '#F5C800', fontWeight: 700, fontSize: '0.88rem' }}>{fmtMoeda(tipo.preco)}</div>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Sabores */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Sabores ({sabores.length}/{tipo.maxSabores})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {saboresLista.map(s => {
              const sel = sabores.includes(s)
              const bloq = !sel && sabores.length >= tipo.maxSabores
              return (
                <button
                  key={s}
                  onClick={() => toggleSabor(s)}
                  disabled={bloq}
                  style={{
                    padding: '5px 12px', borderRadius: '20px', cursor: bloq ? 'default' : 'pointer',
                    fontSize: '0.78rem', fontWeight: sel ? 700 : 500, border: 'none',
                    background: sel ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,255,255,0.12)',
                    color: sel ? '#fff' : bloq ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.88)',
                    transition: 'all 0.12s',
                  }}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        {/* Adicionais */}
        {maxAd > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Adicionais grátis ({adicionais.length}/{maxAd})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {ADICIONAIS_LISTA.map(a => {
                const sel = adicionais.includes(a)
                const bloq = !sel && adicionais.length >= maxAd
                return (
                  <button
                    key={a}
                    onClick={() => toggleAd(a)}
                    disabled={bloq}
                    style={{
                      padding: '5px 12px', borderRadius: '20px', cursor: bloq ? 'default' : 'pointer',
                      fontSize: '0.78rem', fontWeight: sel ? 700 : 500, border: 'none',
                      background: sel ? 'rgba(245,200,0,0.25)' : 'rgba(255,255,255,0.12)',
                      color: sel ? '#F5C800' : bloq ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.88)',
                      transition: 'all 0.12s',
                    }}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Observação */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Observação
          </label>
          <input
            type="text"
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Ex: sem cebola..."
            style={inputStyle}
          />
        </div>

        {/* Confirmar */}
        <button
          onClick={confirmar}
          disabled={sabores.length === 0}
          style={{
            width: '100%', padding: '0.875rem', borderRadius: '14px', cursor: sabores.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.95rem', fontWeight: 800, border: 'none',
            background: sabores.length === 0
              ? 'rgba(255,255,255,0.08)'
              : `linear-gradient(145deg, ${C.red}, ${C.redDark})`,
            color: sabores.length === 0 ? 'rgba(255,255,255,0.4)' : '#fff',
            boxShadow: sabores.length > 0 ? `0 6px 20px rgba(229,57,53,0.4)` : 'none',
          }}
        >
          Adicionar ao Carrinho
        </button>
      </div>
    </div>
  )
}

function PaginaBalcao({ onPedidoCriado, onCaderneta, mesaAdicionando, onCancelarMesa }) {
  const [cart, setCart] = useState([])
  const [tipoModal, setTipoModal] = useState(null)
  const [modo, setModo] = useState('levar')

  // Checkout
  const [nomeCliente, setNomeCliente] = useState('')
  const [pagamento, setPagamento] = useState('dinheiro')
  const [valorRecebido, setValorRecebido] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(null)

  // Busca
  const [busca, setBusca] = useState('')

  // Catálogo de itens diversos
  const [catalogo, setCatalogo] = useState([])
  const [novoItemNome, setNovoItemNome] = useState('')
  const [novoItemPreco, setNovoItemPreco] = useState('')
  const [novoItemEmoji, setNovoItemEmoji] = useState('')
  const [modoEditarCatalogo, setModoEditarCatalogo] = useState(false)
  const [bebidaSaboresMapBalcao, setBebidaSaboresMapBalcao] = useState({})

  // Caderneta — seleção de cliente
  const [clientesCaderneta, setClientesCaderneta] = useState([])
  const [buscaClienteCaderneta, setBuscaClienteCaderneta] = useState('')
  const [clienteSelecionadoCaderneta, setClienteSelecionadoCaderneta] = useState(null) // { id, nome, limite_credito }
  const [saldoClienteCaderneta, setSaldoClienteCaderneta] = useState(0)

  const [cardapioStateBalcao, setCardapioStateBalcao] = useState(null)

  useEffect(() => {
    apiFetch('/api/catalogo').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setCatalogo(data)
    }).catch(() => {})
    apiFetch('/api/bebidas-sabores').then(r => r.json()).then(rows => {
      if (!Array.isArray(rows)) return
      const map = {}
      rows.forEach(r => { map[r.bebida_id] = r.sabores })
      setBebidaSaboresMapBalcao(map)
    }).catch(() => {})
    apiFetch('/api/clientes').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setClientesCaderneta(data)
    }).catch(() => {})
    apiFetch('/api/cardapio-state').then(r => r.json()).then(cfg => {
      if (cfg && typeof cfg === 'object') setCardapioStateBalcao(cfg)
    }).catch(() => {})
  }, [])

  // Precos e desativados do admin
  const precosAdm = cardapioStateBalcao?.precos || {}
  const desativadosAdm = cardapioStateBalcao?.desativados || []
  const tiposPastelAdm = TIPOS_PASTEL.filter(t => !desativadosAdm.includes(t.id)).map(t => ({ ...t, preco: precosAdm[t.id] ?? t.preco }))
  const pasteisDocesAdm = PASTEIS_DOCES.filter(d => !desativadosAdm.includes(d.id)).map(d => ({ ...d, preco: precosAdm[d.id] ?? d.preco }))
  const bebidasAdm = (categorias[0]?.itens || []).filter(b => !desativadosAdm.includes(b.id)).map(b => ({ ...b, preco: precosAdm[b.id] ?? b.preco }))

  const subtotal = somarCart(cart)
  const valorRec = parseFloat(String(valorRecebido).replace(',', '.')) || 0
  const troco = pagamento === 'dinheiro' && valorRec > subtotal ? Math.round((valorRec - subtotal) * 100) / 100 : 0
  const trocoNegativo = pagamento === 'dinheiro' && valorRec > 0 && valorRec < subtotal

  function adicionarPastel(item) {
    setCart(prev => [...prev, item])
  }

  function adicionarBebida(beb) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.chave === `beb-${beb.id}`)
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qtd: i.qtd + 1 } : i)
      return [...prev, { chave: `beb-${beb.id}`, tipoId: 'bebida', nome: beb.nome, preco: beb.preco, qtd: 1 }]
    })
  }

  function removerBebida(bebId) {
    setCart(prev => {
      const chave = `beb-${bebId}`
      const item = prev.find(i => i.chave === chave)
      if (!item) return prev
      if (item.qtd > 1) return prev.map(i => i.chave === chave ? { ...i, qtd: i.qtd - 1 } : i)
      return prev.filter(i => i.chave !== chave)
    })
  }

  function qtdBebida(bebId) {
    return cart.find(i => i.chave === `beb-${bebId}`)?.qtd || 0
  }

  // Bebidas com sabores
  function adicionarBebidaSabor(beb, sabor) {
    setCart(prev => {
      const chave = `beb-${beb.id}-${sabor}`
      const idx = prev.findIndex(i => i.chave === chave)
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qtd: i.qtd + 1 } : i)
      return [...prev, { chave, tipoId: 'bebida', nome: `${beb.nome} ${sabor}`, preco: beb.preco, qtd: 1 }]
    })
  }

  function removerBebidaSabor(bebId, sabor) {
    setCart(prev => {
      const chave = `beb-${bebId}-${sabor}`
      const item = prev.find(i => i.chave === chave)
      if (!item) return prev
      if (item.qtd > 1) return prev.map(i => i.chave === chave ? { ...i, qtd: i.qtd - 1 } : i)
      return prev.filter(i => i.chave !== chave)
    })
  }

  function qtdBebidaSabor(bebId, sabor) {
    return cart.find(i => i.chave === `beb-${bebId}-${sabor}`)?.qtd || 0
  }

  // Pasteis Doces
  function adicionarDoce(doce) {
    setCart(prev => {
      const chave = `doce-${doce.id}`
      const idx = prev.findIndex(i => i.chave === chave)
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qtd: i.qtd + 1 } : i)
      return [...prev, { chave, tipoId: 'doce', nome: `Pastel ${doce.nome}`, sabores: [doce.nome], adicionais: [], observacao: '', preco: doce.preco, qtd: 1 }]
    })
  }

  function removerDoce(doceId) {
    setCart(prev => {
      const chave = `doce-${doceId}`
      const item = prev.find(i => i.chave === chave)
      if (!item) return prev
      if (item.qtd > 1) return prev.map(i => i.chave === chave ? { ...i, qtd: i.qtd - 1 } : i)
      return prev.filter(i => i.chave !== chave)
    })
  }

  function qtdDoce(doceId) {
    return cart.find(i => i.chave === `doce-${doceId}`)?.qtd || 0
  }

  function removerItem(chave) {
    setCart(prev => prev.filter(i => i.chave !== chave))
  }

  async function salvarItemCatalogo() {
    const nome = novoItemNome.trim()
    const preco = parseFloat(String(novoItemPreco).replace(',', '.'))
    if (!nome || !preco || preco <= 0) return
    const res = await apiFetch('/api/catalogo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, preco }),
    })
    const item = await res.json()
    if (res.ok) {
      setCatalogo(prev => [...prev, item])
      setNovoItemNome('')
      setNovoItemPreco('')
      setNovoItemEmoji('')
    }
  }

  async function removerItemCatalogo(id) {
    await fetch(`/api/catalogo?id=${id}`, { method: 'DELETE' })
    setCatalogo(prev => prev.filter(i => i.id !== id))
  }

  function adicionarDoCatalogo(item) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.chave === `div-${item.id}`)
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qtd: i.qtd + 1 } : i)
      return [...prev, { chave: `div-${item.id}`, tipoId: 'diverso', nome: item.nome, preco: item.preco, qtd: 1 }]
    })
  }

  function removerDoCatalogo(id) {
    setCart(prev => {
      const chave = `div-${id}`
      const item = prev.find(i => i.chave === chave)
      if (!item) return prev
      if (item.qtd > 1) return prev.map(i => i.chave === chave ? { ...i, qtd: i.qtd - 1 } : i)
      return prev.filter(i => i.chave !== chave)
    })
  }

  function qtdCatalogo(id) {
    return cart.find(i => i.chave === `div-${id}`)?.qtd || 0
  }

  async function confirmar() {
    if (cart.length === 0) return
    if (pagamento === 'dinheiro' && valorRec > 0 && valorRec < subtotal) return
    if (pagamento === 'caderneta' && !clienteSelecionadoCaderneta) return

    // Caderneta: verificar limite
    if (pagamento === 'caderneta' && clienteSelecionadoCaderneta) {
      const limite = clienteSelecionadoCaderneta.limite_credito ? Number(clienteSelecionadoCaderneta.limite_credito) : null
      if (limite !== null && saldoClienteCaderneta + subtotal > limite) {
        alert(`Limite de crédito atingido!\nLimite: R$ ${Number(limite).toFixed(2)} · Em aberto: R$ ${saldoClienteCaderneta.toFixed(2)}\nNão é possível anotar R$ ${subtotal.toFixed(2)}.`)
        return
      }
    }

    setEnviando(true)
    try {
      // Caderneta: lança na caderneta E registra no fluxo de caixa como fiado
      if (pagamento === 'caderneta') {
        const cliente = clienteSelecionadoCaderneta
        const descricao = cart.map(i => `${i.qtd}x ${i.nome}`).join(', ')
        const res = await apiFetch('/api/caderneta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente_id: cliente.id,
            descricao,
            itens: cart.map(i => ({ nome: i.nome, qtd: i.qtd, preco: i.preco })),
            valor: subtotal,
            data: new Date().toLocaleDateString('pt-BR'),
          }),
        })
        if (res.ok) {
          // Registrar no fluxo de caixa como venda fiado
          try {
            const pedidoRes = await apiFetch('/api/pedido', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nome: cliente.nome,
                telefone: '00000000000',
                pagamento: 'caderneta',
                itens: cart.map(i => ({ tipoId: i.tipoId || 'diverso', nome: i.nome, preco: i.preco, qtd: i.qtd, sabores: i.sabores || [], adicionais: i.adicionais || [], observacao: i.observacao || '' })),
                subtotal,
                total: subtotal,
                origem: 'balcao',
                observacao: `📒 FIADO — ${cliente.nome}`,
                tipo_entrega: 'levar',
              }),
            })
            if (pedidoRes.ok) {
              const pedido = await pedidoRes.json()
              await apiFetch('/api/pedido', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: pedido.id, status: 'entregue' }),
              })
            }
          } catch (_) {}
          setSucesso(`Anotado na caderneta de ${cliente.nome}`)
          setCart([])
          setNomeCliente('')
          setClienteSelecionadoCaderneta(null)
          setBuscaClienteCaderneta('')
          setSaldoClienteCaderneta(0)
          setPagamento('dinheiro')
          onPedidoCriado?.()
          onCaderneta?.()
          setTimeout(() => setSucesso(null), 4000)
        } else {
          const err = await res.json().catch(() => ({}))
          alert(`Erro ao anotar na caderneta: ${err.error || res.status}`)
        }
        setEnviando(false)
        return
      }

      // ── ADICIONANDO ITENS A MESA EXISTENTE ──
      if (mesaAdicionando) {
        const itensExistentes = parseItens(mesaAdicionando.itens)
        const novosItens = cart.map(i => ({
          tipoId: i.tipoId, nome: i.nome, preco: i.preco, qtd: i.qtd,
          sabores: i.sabores || [], adicionais: i.adicionais || [], observacao: i.observacao || '',
        }))
        const todosItens = [...itensExistentes, ...novosItens]
        const novoTotal = somarCart(todosItens)
        const r = await apiFetch('/api/pedido', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: mesaAdicionando.id, itens: todosItens, total: novoTotal, subtotal: novoTotal }),
        })
        if (r.ok) {
          setSucesso(`Itens adicionados à mesa #${mesaAdicionando.numero}`)
          setCart([])
          setNomeCliente('')
          setValorRecebido('')
          setPagamento('dinheiro')
          onPedidoCriado?.()
          setTimeout(() => setSucesso(null), 5000)
        }
        setEnviando(false)
        return
      }

      const isLocal = modo === 'local'
      const obsPrefix = isLocal ? '\ud83c\udf7d\ufe0f COMER NO LOCAL' : '\ud83d\udce6 LEVAR'
      const body = {
        nome: nomeCliente.trim() || (isLocal ? 'Mesa' : 'Balcão'),
        telefone: '00000000000',
        pagamento,
        troco: pagamento === 'dinheiro' && troco > 0 ? troco : null,
        itens: cart.map(i => ({
          tipoId: i.tipoId,
          nome: i.nome,
          preco: i.preco,
          qtd: i.qtd,
          sabores: i.sabores || [],
          adicionais: i.adicionais || [],
          observacao: i.observacao || '',
        })),
        subtotal,
        total: subtotal,
        origem: 'balcao',
        observacao: obsPrefix,
        tipo_entrega: isLocal ? 'local' : 'levar',
      }
      const res = await apiFetch('/api/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const pedido = await res.json()
        if (!isLocal) {
          await apiFetch('/api/pedido', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pedido.id, status: 'entregue' }),
          })
        } else {
          await apiFetch('/api/pedido', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pedido.id, status: 'preparando' }),
          })
        }
        // Auto-criar cliente se nome foi informado
        if (nomeCliente.trim()) {
          apiFetch('/api/clientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nomeCliente.trim(), manual: true }),
          }).catch(() => {})
        }
        setSucesso(pedido.numero)
        setCart([])
        setNomeCliente('')
        setValorRecebido('')
        setPagamento('dinheiro')
        onPedidoCriado?.()
        setTimeout(() => setSucesso(null), 4000)
      }
    } catch (_) {}
    setEnviando(false)
  }

  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
  }

  const inputStyle = {
    padding: '0.55rem 0.875rem', borderRadius: '10px', fontSize: '0.85rem',
    background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  }

  const PAGAMENTOS = [
    { id: 'dinheiro',  label: 'Dinheiro' },
    { id: 'pix',       label: 'PIX' },
    { id: 'debito',    label: 'Débito' },
    { id: 'credito',   label: 'Crédito' },
    { id: 'caderneta', label: '📒 Anotar' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: '1.5rem', alignItems: 'start' }}>

      {/* ── COLUNA ESQUERDA: PRODUTOS ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Local / Levar toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button
            onClick={() => setModo('local')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '1rem 0.5rem', borderRadius: '14px', cursor: 'pointer',
              fontSize: '0.95rem', fontWeight: 800, border: 'none',
              background: modo === 'local'
                ? 'linear-gradient(145deg, #0066cc, #004499)'
                : 'rgba(255,235,235,0.70)',
              color: modo === 'local' ? '#fff' : C.muted,
              boxShadow: modo === 'local' ? '0 4px 16px rgba(0,102,204,0.4)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <UtensilsCrossed size={20} /> Comer no Local
          </button>
          <button
            onClick={() => setModo('levar')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '1rem 0.5rem', borderRadius: '14px', cursor: 'pointer',
              fontSize: '0.95rem', fontWeight: 800, border: 'none',
              background: modo === 'levar'
                ? `linear-gradient(145deg, ${C.gold}, #d4a800)`
                : 'rgba(255,235,235,0.70)',
              color: modo === 'levar' ? '#1a1000' : C.muted,
              boxShadow: modo === 'levar' ? '0 4px 16px rgba(245,200,0,0.4)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <Package size={20} /> Levar
          </button>
        </div>

        {/* Barra de busca */}
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            style={{
              ...inputStyle, width: '100%', paddingLeft: '2.2rem',
              fontSize: '0.92rem', padding: '0.7rem 0.875rem 0.7rem 2.2rem',
            }}
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', padding: 0 }}
            ><X size={15} /></button>
          )}
        </div>

        {/* Resultados da busca */}
        {busca.trim() && (() => {
          const q = busca.trim().toLowerCase()

          const todosProdutos = [
            ...tiposPastelAdm.map(t => ({ _tipo: 'pastel', id: t.id, nome: t.nome, subtitulo: t.subtitulo, preco: t.preco, _obj: t })),
            ...pasteisDocesAdm.map(d => ({ _tipo: 'doce', id: d.id, nome: d.nome, preco: d.preco, _obj: d })),
            ...bebidasAdm.flatMap(b =>
              b.sabores?.length > 0
                ? b.sabores.map(s => ({ _tipo: 'bebida-sabor', id: `${b.id}-${s}`, nome: `${b.nome} ${s}`, preco: b.preco, _obj: b, _sabor: s }))
                : [{ _tipo: 'bebida', id: b.id, nome: b.nome, subtitulo: b.subtitulo, preco: b.preco, _obj: b }]
            ),
            ...catalogo.map(c => ({ _tipo: 'diverso', id: c.id, nome: c.nome, preco: c.preco, _obj: c })),
          ]

          const resultados = todosProdutos.filter(p => p.nome.toLowerCase().includes(q))

          if (resultados.length === 0) {
            return (
              <div style={{ ...cardStyle, color: C.muted, textAlign: 'center', fontSize: '0.85rem', padding: '1.5rem' }}>
                Nenhum produto encontrado para "{busca}"
              </div>
            )
          }

          return (
            <div style={cardStyle}>
              <p style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 0.75rem' }}>
                {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {resultados.map(p => {
                  const isPastel = p._tipo === 'pastel'
                  let qtd = 0
                  if (p._tipo === 'doce') qtd = qtdDoce(p._obj.id)
                  else if (p._tipo === 'bebida') qtd = qtdBebida(p._obj.id)
                  else if (p._tipo === 'bebida-sabor') qtd = qtdBebidaSabor(p._obj.id, p._sabor)
                  else if (p._tipo === 'diverso') qtd = qtdCatalogo(p._obj.id)

                  function handleAdd() {
                    if (p._tipo === 'pastel') { setTipoModal(p._obj); setBusca('') }
                    else if (p._tipo === 'doce') adicionarDoce(p._obj)
                    else if (p._tipo === 'bebida') adicionarBebida(p._obj)
                    else if (p._tipo === 'bebida-sabor') adicionarBebidaSabor(p._obj, p._sabor)
                    else if (p._tipo === 'diverso') adicionarDoCatalogo(p._obj)
                  }
                  function handleRem() {
                    if (p._tipo === 'doce') removerDoce(p._obj.id)
                    else if (p._tipo === 'bebida') removerBebida(p._obj.id)
                    else if (p._tipo === 'bebida-sabor') removerBebidaSabor(p._obj.id, p._sabor)
                    else if (p._tipo === 'diverso') removerDoCatalogo(p._obj.id)
                  }

                  return (
                    <div key={p._tipo + p.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', borderRadius: '10px', gap: '0.75rem',
                      background: qtd > 0 ? 'rgba(229,57,53,0.08)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${qtd > 0 ? 'rgba(229,57,53,0.3)' : C.cardBorder}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                        {p.subtitulo && <div style={{ color: C.muted, fontSize: '0.68rem' }}>{p.subtitulo}</div>}
                        <div style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 700 }}>{fmtMoeda(p.preco)}</div>
                      </div>
                      {isPastel ? (
                        <button
                          onClick={handleAdd}
                          style={{
                            padding: '0.4rem 0.75rem', borderRadius: '8px',
                            background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`,
                            border: 'none', cursor: 'pointer', color: '#fff',
                            fontSize: '0.75rem', fontWeight: 900,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            whiteSpace: 'nowrap', flexShrink: 0,
                          }}
                        >Personalizar</button>
                      ) : qtd === 0 ? (
                        <button
                          onClick={handleAdd}
                          style={{
                            width: '44px', height: '44px', borderRadius: '10px',
                            background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`,
                            border: 'none', cursor: 'pointer', color: '#fff',
                            fontSize: '1.3rem', fontWeight: 900, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >+</button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          <button
                            onClick={handleRem}
                            style={{ width: '44px', height: '44px', background: 'rgba(200,0,0,0.2)', border: 'none', borderRadius: '10px', cursor: 'pointer', color: '#ff7777', fontSize: '1.3rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >−</button>
                          <span style={{ minWidth: '28px', textAlign: 'center', color: '#1A0000', fontWeight: 900, fontSize: '1rem' }}>{qtd}</span>
                          <button
                            onClick={handleAdd}
                            style={{ width: '44px', height: '44px', background: 'rgba(0,200,80,0.15)', border: 'none', borderRadius: '10px', cursor: 'pointer', color: '#6aff9e', fontSize: '1.3rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >+</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Seções normais (escondidas durante busca) */}
        {!busca.trim() && <>

        {/* Pastéis */}
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🥟 Pastéis
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {tiposPastelAdm.map(tipo => (
              <button
                key={tipo.id}
                onClick={() => setTipoModal(tipo)}
                style={{
                  background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.cardBorder}`,
                  borderRadius: '12px', padding: '0.875rem', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(229,57,53,0.15)'
                  e.currentTarget.style.borderColor = 'rgba(229,57,53,0.5)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.borderColor = C.cardBorder
                }}
              >
                <div style={{ color: C.text, fontWeight: 700, fontSize: '0.88rem', marginBottom: '2px' }}>{tipo.nome}</div>
                <div style={{ color: C.muted, fontSize: '0.72rem', marginBottom: '6px' }}>{tipo.subtitulo}</div>
                <div style={{ color: C.gold, fontWeight: 900, fontSize: '1rem' }}>{fmtMoeda(tipo.preco)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Pastéis Doces */}
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🍫 Pastéis Doces
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
            {pasteisDocesAdm.map(doce => {
              const qtd = qtdDoce(doce.id)
              return (
                <div
                  key={doce.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem', borderRadius: '10px',
                    background: qtd > 0 ? 'rgba(245,200,0,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${qtd > 0 ? 'rgba(245,200,0,0.35)' : C.cardBorder}`,
                  }}
                >
                  <div>
                    <div style={{ color: C.text, fontSize: '0.82rem', fontWeight: 600 }}>{doce.nome}</div>
                    <div style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 700 }}>{fmtMoeda(doce.preco)}</div>
                  </div>
                  {qtd === 0 ? (
                    <button
                      onClick={() => adicionarDoce(doce)}
                      style={{
                        width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer',
                        background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, border: 'none',
                        color: '#fff', fontSize: '1.1rem', fontWeight: 900,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >+</button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => removerDoce(doce.id)}
                        style={{ width: '40px', height: '40px', background: 'rgba(200,0,0,0.2)', border: 'none', borderRadius: '9px', cursor: 'pointer', color: '#ff7777', fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >−</button>
                      <span style={{ minWidth: '28px', textAlign: 'center', color: '#1A0000', fontWeight: 900, fontSize: '1rem' }}>{qtd}</span>
                      <button
                        onClick={() => adicionarDoce(doce)}
                        style={{ width: '40px', height: '40px', background: 'rgba(0,200,80,0.15)', border: 'none', borderRadius: '9px', cursor: 'pointer', color: '#6aff9e', fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bebidas */}
        <div style={cardStyle}>
          <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: '0 0 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🥤 Bebidas
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {bebidasAdm.map(beb => {
              const saboresEfetivos = bebidaSaboresMapBalcao[beb.id] ?? beb.sabores ?? []
              const temSabores = saboresEfetivos.length > 0

              // Bebidas com sabores
              if (temSabores) {
                return (
                  <div key={beb.id} style={{
                    padding: '0.625rem 0.75rem', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.cardBorder}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div>
                        <div style={{ color: C.text, fontSize: '0.82rem', fontWeight: 600 }}>{beb.nome}</div>
                        {beb.subtitulo && <div style={{ color: C.muted, fontSize: '0.68rem' }}>{beb.subtitulo}</div>}
                      </div>
                      <span style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 700 }}>{fmtMoeda(beb.preco)}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {saboresEfetivos.map(sabor => {
                        const qtd = qtdBebidaSabor(beb.id, sabor)
                        return (
                          <div key={sabor} style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '4px 8px', borderRadius: '8px',
                            background: qtd > 0 ? 'rgba(229,57,53,0.15)' : 'rgba(255,235,235,0.70)',
                            border: `1px solid ${qtd > 0 ? 'rgba(229,57,53,0.35)' : 'rgba(255,235,235,0.75)'}`,
                          }}>
                            <span style={{ color: qtd > 0 ? '#fff' : C.muted, fontSize: '0.72rem', fontWeight: 600 }}>{sabor}</span>
                            {qtd > 0 && (
                              <>
                                <button onClick={() => removerBebidaSabor(beb.id, sabor)} style={{
                                  width: '32px', height: '32px', background: 'rgba(200,0,0,0.3)', border: 'none',
                                  borderRadius: '7px', cursor: 'pointer', color: '#ff7777', fontSize: '1rem', fontWeight: 900,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                }}>−</button>
                                <span style={{ color: '#1A0000', fontWeight: 900, fontSize: '0.85rem', minWidth: '18px', textAlign: 'center' }}>{qtd}</span>
                              </>
                            )}
                            <button onClick={() => adicionarBebidaSabor(beb, sabor)} style={{
                              width: '32px', height: '32px',
                              background: qtd > 0 ? 'rgba(0,200,80,0.2)' : `linear-gradient(145deg, ${C.red}, ${C.redDark})`,
                              border: 'none', borderRadius: '7px', cursor: 'pointer',
                              color: qtd > 0 ? '#6aff9e' : '#fff', fontSize: '1rem', fontWeight: 900,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            }}>+</button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              }

              // Bebidas sem sabores
              const qtd = qtdBebida(beb.id)
              return (
                <div
                  key={beb.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem', borderRadius: '10px',
                    background: qtd > 0 ? 'rgba(229,57,53,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${qtd > 0 ? 'rgba(229,57,53,0.35)' : C.cardBorder}`,
                  }}
                >
                  <div>
                    <div style={{ color: C.text, fontSize: '0.82rem', fontWeight: 600 }}>{beb.nome}</div>
                    {beb.subtitulo && <div style={{ color: C.muted, fontSize: '0.68rem' }}>{beb.subtitulo}</div>}
                    <div style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 700 }}>{fmtMoeda(beb.preco)}</div>
                  </div>
                  {qtd === 0 ? (
                    <button
                      onClick={() => adicionarBebida(beb)}
                      style={{
                        width: '40px', height: '40px', borderRadius: '10px', cursor: 'pointer',
                        background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, border: 'none',
                        color: '#fff', fontSize: '1.3rem', fontWeight: 900,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >+</button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => removerBebida(beb.id)}
                        style={{ width: '40px', height: '40px', background: 'rgba(200,0,0,0.2)', border: 'none', borderRadius: '9px', cursor: 'pointer', color: '#ff7777', fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >−</button>
                      <span style={{ minWidth: '28px', textAlign: 'center', color: '#1A0000', fontWeight: 900, fontSize: '1rem' }}>{qtd}</span>
                      <button
                        onClick={() => adicionarBebida(beb)}
                        style={{ width: '40px', height: '40px', background: 'rgba(0,200,80,0.15)', border: 'none', borderRadius: '9px', cursor: 'pointer', color: '#6aff9e', fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Itens Diversos — catálogo */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ color: C.text, fontWeight: 800, fontSize: '0.92rem', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📦 Itens Diversos
            </h3>
            <button
              onClick={() => setModoEditarCatalogo(v => !v)}
              style={{
                background: modoEditarCatalogo ? 'rgba(229,57,53,0.2)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${modoEditarCatalogo ? 'rgba(229,57,53,0.4)' : C.cardBorder}`,
                borderRadius: '8px', padding: '4px 10px', cursor: 'pointer',
                color: modoEditarCatalogo ? '#ff7777' : C.muted, fontSize: '0.75rem', fontWeight: 700,
              }}
            >
              {modoEditarCatalogo ? 'Feito' : 'Gerenciar'}
            </button>
          </div>

          {/* Grid de itens do catálogo */}
          {catalogo.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.625rem', marginBottom: '1rem' }}>
              {catalogo.map(item => (
                <div
                  key={item.id}
                  style={{
                    position: 'relative',
                    background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.cardBorder}`,
                    borderRadius: '12px', padding: '0.75rem',
                    cursor: modoEditarCatalogo ? 'default' : 'pointer',
                    transition: 'all 0.12s',
                  }}
                  onClick={() => !modoEditarCatalogo && adicionarDoCatalogo(item)}
                  onMouseEnter={e => { if (!modoEditarCatalogo) { e.currentTarget.style.background = 'rgba(229,57,53,0.12)'; e.currentTarget.style.borderColor = 'rgba(229,57,53,0.4)' } }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = C.cardBorder }}
                >
                  {modoEditarCatalogo && (
                    <button
                      onClick={e => { e.stopPropagation(); removerItemCatalogo(item.id) }}
                      style={{
                        position: 'absolute', top: '-6px', right: '-6px',
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: C.red, border: 'none', color: '#fff',
                        cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >✕</button>
                  )}
                  <div style={{ fontSize: '1.6rem', lineHeight: 1, marginBottom: '4px' }}>{item.emoji}</div>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: '0.82rem', marginBottom: '2px', lineHeight: 1.3 }}>{item.nome}</div>
                  <div style={{ color: C.gold, fontWeight: 900, fontSize: '0.88rem' }}>{fmtMoeda(item.preco)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: '0.8rem', margin: '0 0 1rem', fontStyle: 'italic' }}>
              Nenhum item cadastrado ainda. Adicione abaixo.
            </p>
          )}

          {/* Formulário para novo item */}
          <div style={{ borderTop: `1px solid ${C.cardBorder}`, paddingTop: '0.875rem' }}>
            <p style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 0.5rem' }}>
              Novo item no catálogo
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={novoItemEmoji}
                onChange={e => setNovoItemEmoji(e.target.value)}
                placeholder="🍕"
                style={{ ...inputStyle, width: '52px', textAlign: 'center', fontSize: '1.2rem' }}
                maxLength={2}
              />
              <input
                type="text"
                value={novoItemNome}
                onChange={e => setNovoItemNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvarItemCatalogo()}
                placeholder="Nome do produto..."
                style={{ ...inputStyle, flex: 2, minWidth: '120px' }}
              />
              <input
                type="number"
                value={novoItemPreco}
                onChange={e => setNovoItemPreco(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvarItemCatalogo()}
                placeholder="Preço"
                min="0" step="0.01"
                style={{ ...inputStyle, width: '90px' }}
              />
              <button
                onClick={salvarItemCatalogo}
                disabled={!novoItemNome.trim() || !(parseFloat(novoItemPreco) > 0)}
                style={{
                  padding: '0.55rem 1rem', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 700, border: 'none',
                  background: novoItemNome.trim() && parseFloat(novoItemPreco) > 0
                    ? `linear-gradient(145deg, ${C.red}, ${C.redDark})`
                    : 'rgba(255,255,255,0.07)',
                  color: novoItemNome.trim() && parseFloat(novoItemPreco) > 0 ? '#fff' : C.muted,
                  whiteSpace: 'nowrap',
                }}
              >
                + Salvar
              </button>
            </div>
          </div>
        </div>

        </> /* fim seções normais */}
      </div>

      {/* ── COLUNA DIREITA: CARRINHO + CHECKOUT ── */}
      <div style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 5rem)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Banner: Adicionando itens a mesa */}
        {mesaAdicionando && (
          <div style={{ background: 'rgba(0,100,255,0.12)', border: '1px solid rgba(0,100,255,0.35)', borderRadius: '12px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ color: '#4da6ff', fontWeight: 800, fontSize: '0.88rem' }}>
                📋 Adicionando itens — #{mesaAdicionando.numero}
              </div>
              <div style={{ color: C.muted, fontSize: '0.75rem' }}>
                {mesaAdicionando.nome} · {fmtMoeda(mesaAdicionando.total)}
              </div>
            </div>
            <button onClick={onCancelarMesa} style={{ background: 'rgba(255,235,235,0.75)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#1A0000', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, touchAction: 'manipulation' }}>
              Cancelar
            </button>
          </div>
        )}

        {/* Sucesso */}
        {sucesso && (
          <div style={{
            background: 'rgba(0,200,80,0.15)', border: '1px solid rgba(0,200,80,0.4)',
            borderRadius: '12px', padding: '0.875rem 1.25rem',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Check size={16} color={C.success} />
            <div>
              <div style={{ color: C.success, fontWeight: 800, fontSize: '0.88rem' }}>Venda registrada!</div>
              <div style={{ color: 'rgba(0,200,80,0.7)', fontSize: '0.72rem' }}>Pedido #{sucesso}</div>
            </div>
          </div>
        )}

        {/* Carrinho */}
        <div style={{
          background: C.card, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${C.cardBorder}`, borderRadius: '16px', overflow: 'hidden',
        }}>
          {/* Cabeçalho do carrinho */}
          <div style={{
            padding: '0.875rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShoppingCart size={16} color={C.red} />
              <span style={{ color: C.text, fontWeight: 800, fontSize: '0.88rem' }}>
                Carrinho
              </span>
              {cart.length > 0 && (
                <span style={{
                  background: C.red, color: '#fff', borderRadius: '999px',
                  fontSize: '0.65rem', fontWeight: 900, padding: '1px 6px',
                }}>
                  {cart.reduce((s, i) => s + i.qtd, 0)}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,100,100,0.6)', fontSize: '0.72rem' }}
              >
                Limpar
              </button>
            )}
          </div>

          {/* Itens */}
          {cart.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: C.muted }}>
              <ShoppingCart size={28} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
              <p style={{ margin: 0, fontSize: '0.82rem' }}>Nenhum item</p>
            </div>
          ) : (
            <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
              {cart.map(item => (
                <div
                  key={item.chave}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                    padding: '6px 8px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${C.cardBorder}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.qtd > 1 ? `${item.qtd}x ` : ''}{item.nome}
                    </div>
                    {item.sabores?.length > 0 && (
                      <div style={{ color: C.muted, fontSize: '0.68rem', marginTop: '1px' }}>
                        {item.sabores.join(', ')}
                      </div>
                    )}
                    {item.adicionais?.length > 0 && (
                      <div style={{ color: 'rgba(245,200,0,0.6)', fontSize: '0.68rem' }}>
                        + {item.adicionais.join(', ')}
                      </div>
                    )}
                    {item.observacao && (
                      <div style={{ color: C.muted, fontSize: '0.67rem', fontStyle: 'italic' }}>{item.observacao}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: C.gold, fontWeight: 700, fontSize: '0.82rem' }}>
                      {fmtMoeda(item.preco * item.qtd)}
                    </div>
                    <button
                      onClick={() => removerItem(item.chave)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,100,100,0.5)', padding: '0', marginTop: '2px', fontSize: '0.7rem' }}
                    >
                      remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          {cart.length > 0 && (
            <div style={{
              padding: '0.875rem 1.25rem',
              borderTop: `1px solid ${C.cardBorder}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: C.muted, fontSize: '0.82rem', fontWeight: 600 }}>Total</span>
              <span style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '1px' }}>
                {fmtMoeda(subtotal)}
              </span>
            </div>
          )}
        </div>

        {/* Checkout */}
        {cart.length > 0 && (
          <div style={{
            background: C.card, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
            display: 'flex', flexDirection: 'column', gap: '0.875rem',
          }}>

            {/* Nome do cliente */}
            <div>
              <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                Cliente (opcional)
              </label>
              <input
                type="text"
                value={nomeCliente}
                onChange={e => setNomeCliente(e.target.value)}
                placeholder={modo === 'local' ? 'Mesa' : 'Balcão'}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>

            {/* Pagamento */}
            <div>
              <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Pagamento
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {PAGAMENTOS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setPagamento(p.id); setValorRecebido('') }}
                    style={{
                      padding: '0.55rem', borderRadius: '10px', cursor: 'pointer',
                      fontSize: '0.82rem', fontWeight: 700, border: 'none',
                      background: pagamento === p.id ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.70)',
                      color: pagamento === p.id ? '#fff' : C.muted,
                      transition: 'all 0.12s',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Troco (dinheiro) */}
            {pagamento === 'dinheiro' && (
              <div>
                <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Valor recebido (R$)
                </label>
                <input
                  type="number"
                  value={valorRecebido}
                  onChange={e => setValorRecebido(e.target.value)}
                  placeholder="0,00"
                  min="0"
                  step="0.01"
                  style={{ ...inputStyle, width: '100%' }}
                />
                {valorRec > 0 && (
                  <div style={{
                    marginTop: '8px', padding: '0.625rem 0.875rem', borderRadius: '10px',
                    background: trocoNegativo ? 'rgba(200,0,0,0.15)' : 'rgba(0,200,80,0.12)',
                    border: `1px solid ${trocoNegativo ? 'rgba(200,0,0,0.35)' : 'rgba(0,200,80,0.3)'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ color: trocoNegativo ? '#ff7777' : C.muted, fontSize: '0.8rem', fontWeight: 600 }}>
                      {trocoNegativo ? 'Valor insuficiente' : 'Troco'}
                    </span>
                    {!trocoNegativo && (
                      <span style={{ color: C.success, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', letterSpacing: '1px' }}>
                        {fmtMoeda(troco)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Caderneta — busca de cliente */}
            {pagamento === 'caderneta' && (
              <div>
                <label style={{ display: 'block', color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Cliente da caderneta *
                </label>
                {clienteSelecionadoCaderneta ? (
                  <div style={{
                    padding: '0.625rem 0.875rem', borderRadius: '10px',
                    background: 'rgba(255,100,0,0.1)', border: '1px solid rgba(255,100,0,0.35)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ color: C.text, fontWeight: 700, fontSize: '0.88rem' }}>{clienteSelecionadoCaderneta.nome}</div>
                      <div style={{ color: C.muted, fontSize: '0.72rem' }}>
                        Em aberto: {fmtMoeda(saldoClienteCaderneta)}
                        {clienteSelecionadoCaderneta.limite_credito && (
                          <span style={{ color: saldoClienteCaderneta + subtotal > Number(clienteSelecionadoCaderneta.limite_credito) ? C.danger : C.muted }}>
                            {' '}/ limite {fmtMoeda(clienteSelecionadoCaderneta.limite_credito)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setClienteSelecionadoCaderneta(null); setBuscaClienteCaderneta(''); setSaldoClienteCaderneta(0) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.85rem' }}
                    >✕</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={buscaClienteCaderneta}
                      onChange={e => setBuscaClienteCaderneta(e.target.value)}
                      placeholder="Buscar cliente por nome ou CPF..."
                      style={{ ...inputStyle, width: '100%' }}
                    />
                    {buscaClienteCaderneta.trim().length >= 2 && (() => {
                      const q = buscaClienteCaderneta.trim().toLowerCase()
                      const matches = clientesCaderneta.filter(c =>
                        c.nome?.toLowerCase().includes(q) || (c.cpf || '').includes(buscaClienteCaderneta.replace(/\D/g, ''))
                      ).slice(0, 6)
                      const nomeNovo = buscaClienteCaderneta.trim()
                      return (
                        <div style={{
                          position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50,
                          background: 'rgba(30,8,8,0.98)', border: `1px solid ${C.cardBorder}`,
                          borderRadius: '10px', overflow: 'hidden', marginTop: '4px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        }}>
                          {matches.map(c => (
                            <button
                              key={c.id}
                              onClick={async () => {
                                const r = await fetch(`/api/caderneta?cliente_id=${c.id}`).then(r => r.json()).catch(() => [])
                                const saldo = Array.isArray(r) ? r.filter(e => !e.pago).reduce((s, e) => s + Number(e.valor), 0) : 0
                                setClienteSelecionadoCaderneta(c)
                                setSaldoClienteCaderneta(saldo)
                                setBuscaClienteCaderneta('')
                              }}
                              style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                width: '100%', padding: '0.625rem 0.875rem', background: 'none', border: 'none',
                                borderBottom: `1px solid ${C.cardBorder}`, cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <div>
                                <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>{c.nome}</div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>{c.cpf ? `CPF ${c.cpf}` : c.telefone}</div>
                              </div>
                            </button>
                          ))}
                          {/* Criar novo cliente */}
                          <button
                            onClick={async () => {
                              const res = await apiFetch('/api/clientes', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ nome: nomeNovo, manual: true }),
                              })
                              const novo = await res.json()
                              if (res.ok || res.status === 201) {
                                setClientesCaderneta(prev => [novo, ...prev])
                                setClienteSelecionadoCaderneta(novo)
                                setSaldoClienteCaderneta(0)
                                setBuscaClienteCaderneta('')
                              }
                            }}
                            style={{
                              display: 'block', width: '100%', padding: '0.625rem 0.875rem',
                              background: 'rgba(245,166,35,0.15)', border: 'none',
                              cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <div style={{ color: '#F5C800', fontWeight: 700, fontSize: '0.85rem' }}>+ Criar "{nomeNovo}"</div>
                            <div style={{ color: 'rgba(245,200,0,0.6)', fontSize: '0.7rem' }}>Novo cliente na caderneta</div>
                          </button>
                        </div>
                      )
                    })()}
                  </div>
                )}
                {clienteSelecionadoCaderneta?.limite_credito && saldoClienteCaderneta + subtotal > Number(clienteSelecionadoCaderneta.limite_credito) && (
                  <div style={{ marginTop: '6px', color: C.danger, fontSize: '0.78rem', fontWeight: 700 }}>
                    ⚠️ Limite atingido — não é possível anotar
                  </div>
                )}
              </div>
            )}

            {/* Botão Confirmar */}
            {(() => {
              const limiteExcedido = pagamento === 'caderneta' && clienteSelecionadoCaderneta?.limite_credito &&
                saldoClienteCaderneta + subtotal > Number(clienteSelecionadoCaderneta.limite_credito)
              const semClienteCaderneta = pagamento === 'caderneta' && !clienteSelecionadoCaderneta
              const bloqueado = enviando || trocoNegativo || limiteExcedido || semClienteCaderneta
              return (
            <button
              onClick={confirmar}
              disabled={bloqueado}
              style={{
                width: '100%', padding: '0.875rem', borderRadius: '14px',
                cursor: bloqueado ? 'not-allowed' : 'pointer',
                fontSize: '1rem', fontWeight: 800, border: 'none',
                background: bloqueado
                  ? 'rgba(255,255,255,0.08)'
                  : `linear-gradient(145deg, ${C.gold}, #d4a800)`,
                color: bloqueado ? C.muted : '#1a1000',
                boxShadow: !trocoNegativo && !enviando ? '0 6px 20px rgba(245,200,0,0.3)' : 'none',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {enviando
                ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Registrando...</>
                : mesaAdicionando
                  ? <><Plus size={16} /> + Adicionar à Mesa #{mesaAdicionando.numero} — {fmtMoeda(subtotal)}</>
                  : pagamento === 'caderneta'
                    ? <><BookOpen size={16} /> Anotar na Caderneta — {fmtMoeda(subtotal)}</>
                    : <><Banknote size={16} /> Registrar Venda — {fmtMoeda(subtotal)}</>
              }
            </button>
              )
            })()}
          </div>
        )}
      </div>

      {/* Modal sabores */}
      {tipoModal && (
        <ModalSaboresBalcao
          tipo={tipoModal}
          onFechar={() => setTipoModal(null)}
          onAdicionar={item => { adicionarPastel(item); setTipoModal(null) }}
        />
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINA 8: MESAS ABERTAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PaginaMesas({ pedidos, onAtualizar, onAdicionarItens }) {
  const [fechando, setFechando] = useState(null) // id do pedido mostrando pagamento
  const [pagamento, setPagamento] = useState('dinheiro')
  const [enviando, setEnviando] = useState(false)

  const mesasAbertas = (pedidos || []).filter(p =>
    p.origem === 'balcao' &&
    (p.observacao || '').includes('COMER NO LOCAL') &&
    p.status === 'preparando'
  )

  async function fecharConta(pedidoId) {
    setEnviando(true)
    try {
      await apiFetch('/api/pedido', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pedidoId, status: 'entregue' }),
      })
      setFechando(null)
      onAtualizar?.()
    } catch (_) {}
    setEnviando(false)
  }

  const cardStyle = {
    background: 'rgba(255,248,248,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: `1.5px solid ${C.cardBorder}`, borderRadius: '16px', padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(120,0,0,0.16), 0 1px 4px rgba(120,0,0,0.09)',
    marginBottom: '1rem',
  }

  const PAGAMENTOS = [
    { id: 'dinheiro', label: 'Dinheiro' },
    { id: 'pix',      label: 'PIX' },
    { id: 'debito',   label: 'Débito' },
    { id: 'credito',  label: 'Crédito' },
  ]

  if (mesasAbertas.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <UtensilsCrossed size={48} color={C.muted} style={{ opacity: 0.3, marginBottom: '1rem' }} />
        <p style={{ color: C.muted, fontSize: '1rem', fontWeight: 600 }}>Nenhuma mesa aberta no momento</p>
        <p style={{ color: C.muted, fontSize: '0.8rem', opacity: 0.6 }}>Vendas com "Comer no Local" aparecerao aqui</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
      {mesasAbertas.map(pedido => {
        const itens = parseItens(pedido.itens)
        const total = itens.reduce((s, i) => s + (i.preco || 0) * (i.qtd || 1), 0)
        const min = minutosAtras(pedido.created_at)
        const corTempo = min < 15 ? C.success : min < 30 ? C.warning : C.danger

        return (
          <div key={pedido.id} style={cardStyle}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <div>
                <div style={{ color: C.text, fontWeight: 800, fontSize: '1rem' }}>
                  {pedido.nome || 'Mesa'}
                </div>
                <div style={{ color: C.muted, fontSize: '0.72rem' }}>
                  #{pedido.numero} — {fmtHora(pedido.created_at)}
                </div>
              </div>
              <div style={{
                padding: '4px 10px', borderRadius: '20px',
                background: `${corTempo}22`, border: `1px solid ${corTempo}55`,
                color: corTempo, fontSize: '0.78rem', fontWeight: 700,
              }}>
                {min} min
              </div>
            </div>

            {/* Itens */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '0.875rem' }}>
              {itens.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: C.text, fontSize: '0.82rem', fontWeight: 600 }}>
                      {(item.qtd || 1) > 1 ? `${item.qtd}x ` : ''}{item.nome}
                    </span>
                    {item.sabores?.length > 0 && (
                      <span style={{ color: C.muted, fontSize: '0.68rem', marginLeft: '4px' }}>
                        ({item.sabores.join(', ')})
                      </span>
                    )}
                  </div>
                  <span style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 700 }}>
                    {fmtMoeda((item.preco || 0) * (item.qtd || 1))}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.625rem 0', borderTop: `1px solid ${C.cardBorder}`, marginBottom: '0.875rem',
            }}>
              <span style={{ color: C.muted, fontSize: '0.88rem', fontWeight: 700 }}>Total</span>
              <span style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.4rem', letterSpacing: '1px' }}>
                {fmtMoeda(total)}
              </span>
            </div>

            {/* Acoes */}
            {fechando === pedido.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {PAGAMENTOS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPagamento(p.id)}
                      style={{
                        padding: '0.5rem', borderRadius: '10px', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: 700, border: 'none',
                        background: pagamento === p.id ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.70)',
                        color: pagamento === p.id ? '#fff' : C.muted,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setFechando(null)}
                    style={{
                      flex: 1, padding: '0.625rem', borderRadius: '10px', cursor: 'pointer',
                      fontSize: '0.82rem', fontWeight: 700, border: `1px solid ${C.cardBorder}`,
                      background: 'rgba(255,235,235,0.70)', color: C.muted,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => fecharConta(pedido.id)}
                    disabled={enviando}
                    style={{
                      flex: 2, padding: '0.625rem', borderRadius: '10px', cursor: 'pointer',
                      fontSize: '0.82rem', fontWeight: 800, border: 'none',
                      background: `linear-gradient(145deg, ${C.success}, #00a844)`,
                      color: '#fff', opacity: enviando ? 0.6 : 1,
                    }}
                  >
                    {enviando ? 'Fechando...' : 'Confirmar Fechamento'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onAdicionarItens?.(pedido)}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '12px', cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: 700, border: '1px solid rgba(0,120,255,0.4)',
                    background: 'rgba(0,120,255,0.15)', color: '#4da6ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    touchAction: 'manipulation',
                  }}
                >
                  <Plus size={14} /> + Itens
                </button>
                <button
                  onClick={() => { setFechando(pedido.id); setPagamento('dinheiro') }}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '12px', cursor: 'pointer',
                    fontSize: '0.88rem', fontWeight: 800, border: 'none',
                    background: `linear-gradient(145deg, ${C.success}, #00a844)`,
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    touchAction: 'manipulation',
                  }}
                >
                  <Banknote size={16} /> Fechar Conta
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MODAL CHECKOUT (pagamento + desconto) — exportado para evitar tree-shaking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function ModalCheckout({ pedido, onFechar, onConfirmar, enviando, senhaAdmin }) {
  const [pagamento, setPagamento] = useState(pedido?.pagamento === 'pendente' ? 'dinheiro' : (pedido?.pagamento || 'dinheiro'))
  const [valorRecebido, setValorRecebido] = useState('')
  const [descontoTipo, setDescontoTipo] = useState('nenhum')
  const [descontoValor, setDescontoValor] = useState('')
  const [descontoObs, setDescontoObs] = useState('')
  const [senhaInput, setSenhaInput] = useState('')
  const [descontoAutorizado, setDescontoAutorizado] = useState(false)
  const [erroSenha, setErroSenha] = useState('')

  if (!pedido) return null

  const total = Number(pedido.total || 0)
  const itens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens || '[]') : (pedido.itens || [])

  function resetDesconto() {
    setDescontoTipo('nenhum'); setDescontoValor(''); setDescontoObs('')
    setSenhaInput(''); setDescontoAutorizado(false); setErroSenha('')
  }
  function validarSenha() {
    if (!senhaAdmin) { setErroSenha('Senha de desconto nao configurada'); setTimeout(() => setErroSenha(''), 2500); return }
    if (senhaInput === senhaAdmin) { setDescontoAutorizado(true); setErroSenha('') }
    else { setErroSenha('Senha incorreta'); setTimeout(() => setErroSenha(''), 2500) }
  }

  const descontoCalc = (() => {
    if (!descontoAutorizado) return 0
    if (descontoTipo === 'valor') return Math.min(parseFloat(String(descontoValor).replace(',','.')) || 0, total)
    if (descontoTipo === 'porcentagem') {
      const pct = parseFloat(String(descontoValor).replace(',','.')) || 0
      return Math.round(total * Math.min(pct, 100) / 100 * 100) / 100
    }
    return 0
  })()
  const totalFinal = Math.max(0, Math.round((total - descontoCalc) * 100) / 100)
  const descontoPct = descontoTipo === 'porcentagem' ? (parseFloat(String(descontoValor).replace(',','.')) || 0) : null
  const valorRec = parseFloat(String(valorRecebido).replace(',','.')) || 0
  const troco = pagamento === 'dinheiro' && valorRec > totalFinal ? Math.round((valorRec - totalFinal) * 100) / 100 : 0
  const trocoNeg = pagamento === 'dinheiro' && valorRec > 0 && valorRec < totalFinal

  const inputSt = { width: '100%', padding: '0.6rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem',
    background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.cardBorder}`, color: C.text, outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onFechar}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '95%', maxWidth: '440px', maxHeight: '85vh', overflowY: 'auto',
        background: C.bg, borderRadius: '20px', border: `1px solid ${C.cardBorder}`, padding: '1.25rem',
      }}>
        {/* Titulo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ color: C.text, fontWeight: 800, fontSize: '1.05rem' }}>Finalizar #{pedido.numero}</span>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={22} /></button>
        </div>

        {/* Itens */}
        <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.cardBorder}`, marginBottom: '1rem' }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: '0.88rem', marginBottom: '4px' }}>{pedido.nome}</div>
          {itens.map((it, i) => (
            <div key={i} style={{ color: C.muted, fontSize: '0.78rem', lineHeight: 1.5 }}>
              {it.qtd || 1}x {it.nome} — <span style={{ color: C.gold }}>{fmtMoeda((it.preco || 0) * (it.qtd || 1))}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.cardBorder}`, marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted, fontWeight: 600 }}>Total</span>
            <span style={{ color: C.gold, fontWeight: 800, fontSize: '1.1rem' }}>{fmtMoeda(total)}</span>
          </div>
        </div>

        {/* Desconto */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Desconto</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: descontoTipo !== 'nenhum' ? '8px' : '0' }}>
            {[['nenhum','Nenhum'],['valor','R$ Fixo'],['porcentagem','% Off']].map(([t, label]) => (
              <button key={t} onClick={() => { resetDesconto(); setDescontoTipo(t) }} style={{
                padding: '0.5rem 0', borderRadius: '10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, border: 'none',
                background: descontoTipo === t ? 'linear-gradient(145deg,#1a6b1a,#0d4a0d)' : 'rgba(255,255,255,0.07)',
                color: descontoTipo === t ? '#fff' : C.muted,
              }}>{label}</button>
            ))}
          </div>
          {descontoTipo !== 'nenhum' && !descontoAutorizado && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <input type="password" value={senhaInput} onChange={e => setSenhaInput(e.target.value)}
                placeholder="Senha do admin" onKeyDown={e => e.key === 'Enter' && validarSenha()}
                style={{ ...inputSt, flex: 1 }} />
              <button onClick={validarSenha} style={{ padding: '0 1rem', borderRadius: '10px', cursor: 'pointer', background: 'linear-gradient(145deg,#1a6b1a,#0d4a0d)', border: 'none', color: '#fff', fontWeight: 700 }}>OK</button>
            </div>
          )}
          {erroSenha && <p style={{ color: '#FF5252', fontSize: '0.72rem', margin: '0 0 6px', fontWeight: 700 }}>{erroSenha}</p>}
          {descontoTipo !== 'nenhum' && descontoAutorizado && (<>
            <input type="number" value={descontoValor} onChange={e => setDescontoValor(e.target.value)}
              placeholder={descontoTipo === 'valor' ? 'Valor (R$)' : 'Porcentagem (%)'} min="0" step={descontoTipo === 'valor' ? '0.01' : '1'}
              style={{ ...inputSt, marginBottom: '6px' }} />
            <input type="text" value={descontoObs} onChange={e => setDescontoObs(e.target.value)}
              placeholder="Motivo do desconto (obrigatorio)" style={{ ...inputSt, border: '1px solid rgba(0,200,0,0.3)' }} />
          </>)}
        </div>
        {descontoCalc > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.875rem', borderRadius: '10px', marginBottom: '0.75rem', background: 'rgba(0,180,0,0.1)', border: '1px solid rgba(0,200,0,0.25)' }}>
            <span style={{ color: '#4ade80', fontSize: '0.85rem', fontWeight: 700 }}>{descontoTipo === 'porcentagem' ? `${descontoValor}%` : 'Desconto'}</span>
            <span style={{ color: '#4ade80', fontWeight: 800 }}>- {fmtMoeda(descontoCalc)}</span>
          </div>
        )}

        {/* Pagamento */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Pagamento</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px' }}>
            {['dinheiro','pix','debito','credito'].map(p => (
              <button key={p} onClick={() => { setPagamento(p); setValorRecebido('') }} style={{
                padding: '0.55rem 0', borderRadius: '10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, border: 'none',
                background: pagamento === p ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,255,255,0.07)',
                color: pagamento === p ? '#fff' : C.muted, textTransform: 'capitalize',
              }}>{p === 'debito' ? 'Debito' : p === 'credito' ? 'Credito' : p === 'dinheiro' ? 'Dinheiro' : 'PIX'}</button>
            ))}
          </div>
        </div>

        {/* Troco */}
        {pagamento === 'dinheiro' && (
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Valor recebido (R$)</label>
            <input type="number" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} placeholder="0,00" min="0" step="0.01" style={inputSt} />
            {valorRec > 0 && (
              <div style={{ marginTop: '6px', padding: '0.5rem 0.875rem', borderRadius: '10px',
                background: trocoNeg ? 'rgba(200,0,0,0.15)' : 'rgba(0,200,80,0.12)',
                border: `1px solid ${trocoNeg ? 'rgba(200,0,0,0.35)' : 'rgba(0,200,80,0.3)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: trocoNeg ? '#ff7777' : C.muted, fontSize: '0.85rem', fontWeight: 600 }}>{trocoNeg ? 'Insuficiente' : 'Troco'}</span>
                {!trocoNeg && <span style={{ color: C.success, fontWeight: 800, fontSize: '1.2rem' }}>{fmtMoeda(troco)}</span>}
              </div>
            )}
          </div>
        )}

        {/* Confirmar */}
        <button
          onClick={() => onConfirmar({
            pedidoId: pedido.id, pagamento,
            troco: troco > 0 ? troco : null,
            desconto: descontoCalc > 0 ? { tipo: descontoTipo, valor: descontoCalc, pct: descontoPct, obs: descontoObs } : null,
          })}
          disabled={enviando || trocoNeg || (descontoCalc > 0 && !descontoObs.trim())}
          style={{
            width: '100%', padding: '1rem', borderRadius: '14px',
            cursor: enviando || trocoNeg ? 'not-allowed' : 'pointer',
            fontSize: '1rem', fontWeight: 800, border: 'none',
            background: trocoNeg || enviando ? 'rgba(255,255,255,0.08)' : `linear-gradient(145deg, ${C.success}, #009940)`,
            color: trocoNeg || enviando ? C.muted : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          {enviando ? 'Finalizando...' : `Finalizar — ${fmtMoeda(totalFinal)}`}
        </button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function Admin() {
  console.log("ADMIN_BUILD_V4_WITH_CHECKOUT")
  // Auth
  const [logado, setLogado] = useState(() => sessionStorage.getItem('carioca_admin') === '1')
  const [senha, setSenha] = useState('')
  const [errLogin, setErrLogin] = useState('')

  // Dados
  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [configLoja, setConfigLoja] = useState(null)
  const [pedidoImprimir, setPedidoImprimir] = useState(null)

  // Navegacao
  const [paginaAtiva, setPaginaAtiva] = useState('pedidos')
  const [cadernetaKey, setCadernetaKey] = useState(0)
  const [mesaAdicionando, setMesaAdicionando] = useState(null)
  const [sidebarAberta, setSidebarAberta] = useState(() => window.innerWidth >= 768)
  const [mobileOverlay, setMobileOverlay] = useState(false)
  const [checkoutPedido, setCheckoutPedido] = useState(null)
  const [fechandoCheckout, setFechandoCheckout] = useState(false)

  // UI
  const [autoprint, setAutoprint] = useState(() => localStorage.getItem('autoprint') === 'true')
  const [toast, setToast] = useState(null)
  const [horaAtual, setHoraAtual] = useState(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))

  // Alertas de novos pedidos (limpa ao entrar na aba pedidos)
  const [alertasNovos, setAlertasNovos] = useState([])

  const pedidosRef = useRef([])
  const idsConhecidosRef = useRef(null) // null = primeira carga (não alertar)
  const isMobile = () => window.innerWidth < 768

  // Relogio ao vivo
  useEffect(() => {
    const iv = setInterval(() => {
      setHoraAtual(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    }, 30000)
    return () => clearInterval(iv)
  }, [])

  // Limpa alertas ao entrar na aba pedidos
  useEffect(() => {
    if (paginaAtiva === 'pedidos') setAlertasNovos([])
  }, [paginaAtiva])

  // Repetição do alerta a cada 25s enquanto não visualizar pedidos
  useEffect(() => {
    if (alertasNovos.length === 0 || paginaAtiva === 'pedidos') return
    const iv = setInterval(() => {
      tocarBeep()
      falarVoz(`Atenção! Você tem ${alertasNovos.length === 1 ? 'um novo pedido' : `${alertasNovos.length} novos pedidos`}`)
    }, 25000)
    return () => clearInterval(iv)
  }, [alertasNovos.length, paginaAtiva])

  // Polling
  const dataFiltroRef = useRef(null)
  const dataFimFiltroRef = useRef(null)

  const carregarPedidos = useCallback(async (silencioso = false, dataOverride = null, dataFimOverride = null) => {
    try {
      const dataParam = dataOverride || dataFiltroRef.current || (() => {
        const agora = new Date()
        return `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-${String(agora.getDate()).padStart(2,'0')}`
      })()
      if (dataOverride) {
        dataFiltroRef.current = dataOverride
        dataFimFiltroRef.current = dataFimOverride || null
        idsConhecidosRef.current = null // reset: não tratar pedidos existentes como novos ao trocar de data
      }
      const dataFimParam = dataFimFiltroRef.current
      const url = dataFimParam
        ? `/api/pedido?dataInicio=${dataParam}&dataFim=${dataFimParam}&tz=-3`
        : `/api/pedido?data=${dataParam}&tz=-3`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const lista = Array.isArray(data) ? data : []

        const idsAtuais = new Set(lista.map(p => p.id))

        // Primeira carga: apenas registra IDs sem alertar
        if (idsConhecidosRef.current === null) {
          idsConhecidosRef.current = idsAtuais
        } else {
          // Detecta pedidos novos (IDs que não existiam antes)
          const novos = lista.filter(p => !idsConhecidosRef.current.has(p.id))
          if (novos.length > 0) {
            novos.forEach(novo => {
              const ehBalcao = novo.origem === 'balcao'
              if (!ehBalcao) {
                tocarBeep()
                falarVoz(`Atenção! Novo pedido de ${novo.nome}`)
                setToast(`Novo pedido! #${novo.numero} — ${novo.nome}`)
                setTimeout(() => setToast(null), 6000)
                setAlertasNovos(prev => [...prev, novo])
              }
              if (autoprint && !ehBalcao) {
                imprimir(novo)
              }
            })
          }
          // Atualiza set com todos IDs conhecidos
          idsConhecidosRef.current = idsAtuais
        }

        pedidosRef.current = lista
        setPedidos(lista)
      }
    } catch (_) {}
    if (!silencioso) setCarregando(false)
  }, [autoprint])

  async function carregarConfig() {
    try {
      const res = await apiFetch('/api/cardapio-state')
      if (res.ok) setConfigLoja(await res.json())
    } catch (_) {}
  }

  useEffect(() => {
    if (!logado) return
    carregarPedidos()
    carregarConfig()
    const iv = setInterval(() => carregarPedidos(true), 10000)

    // Keepalive da impressora térmica
    const imp = getNomeImpressoraSalva()
    if (imp) iniciarKeepAlive(imp)

    return () => { clearInterval(iv); pararKeepAlive() }
  }, [logado, carregarPedidos])

  async function login() {
    try {
      const res = await apiFetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        if (json.token) sessionStorage.setItem('carioca_admin_token', json.token)
        setLogado(true)
        sessionStorage.setItem('carioca_admin', '1')
        setErrLogin('')
      } else {
        setErrLogin(json.erro || 'Senha incorreta.')
      }
    } catch { setErrLogin('Erro de conexão.') }
  }

  function adicionarItensMesaAdmin(pedido) {
    setMesaAdicionando(pedido)
    setPaginaAtiva('balcao')
  }

  // Acoes pedido
  async function atualizarStatus(id, novoStatus) {
    try {
      await apiFetch('/api/pedido', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: novoStatus }),
      })
      carregarPedidos(true)

      // Notificar cliente via WhatsApp (fire-and-forget)
      apiFetch('/api/whatsapp/notificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId: id, novoStatus }),
      }).catch(() => {})
    } catch (_) {}
  }

  async function fecharCheckout({ pedidoId, pagamento, troco, desconto }) {
    setFechandoCheckout(true)
    try {
      const conta = pedidos.find(p => p.id === pedidoId)
      const totalOriginal = Number(conta?.total || 0)
      const descontoValorReal = desconto?.valor || 0
      const totalFinal = Math.max(0, Math.round((totalOriginal - descontoValorReal) * 100) / 100)
      const patchBody = { id: pedidoId, status: 'entregue', force_status: true, pagamento }
      if (troco) patchBody.troco = troco
      if (descontoValorReal > 0) {
        patchBody.total = totalFinal
        patchBody.subtotal = totalOriginal
        const obsAtual = conta?.observacao || ''
        const descontoInfo = `\uD83C\uDF81 DESCONTO: R$ ${descontoValorReal.toFixed(2).replace('.', ',')}${desconto.obs ? ` \u2014 ${desconto.obs}` : ''}`
        patchBody.observacao = obsAtual ? `${obsAtual}\n${descontoInfo}` : descontoInfo
        patchBody.desconto_tipo = desconto.tipo
        patchBody.desconto_valor = descontoValorReal
        patchBody.desconto_pct = desconto.pct || null
        patchBody.desconto_obs = desconto.obs || ''
      }
      await apiFetch('/api/pedido', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      setCheckoutPedido(null)
      setToast('Venda finalizada com sucesso!')
      setTimeout(() => setToast(null), 4000)
      carregarPedidos(true)
    } catch (_) {}
    setFechandoCheckout(false)
  }

  async function excluirPedido(id, skipConfirm) {
    if (!skipConfirm && !window.confirm('Excluir este pedido?')) return
    try {
      await fetch(`/api/pedido?id=${id}`, { method: 'DELETE' })
      carregarPedidos(true)
    } catch (_) {}
  }

  async function salvarPedido(id, updates) {
    try {
      await apiFetch('/api/pedido', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      carregarPedidos(true)
    } catch (_) {}
  }

  async function imprimir(pedido) {
    const impressora = getNomeImpressoraSalva()
    if (impressora) {
      try {
        await imprimirPedidoQZ(pedido, impressora)
        setToast('Impresso na térmica!')
        setTimeout(() => setToast(null), 3000)
        return
      } catch (e) {
        console.warn('QZ Tray falhou, usando window.print:', e)
      }
    }
    // fallback
    setPedidoImprimir(pedido)
    setTimeout(() => window.print(), 300)
  }

  async function salvarConfig(form) {
    const res = await apiFetch('/api/cardapio-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Erro ${res.status}`)
    }
    const data = await res.json()
    setConfigLoja(data)
  }

  function toggleAutoprint() {
    const novo = !autoprint
    setAutoprint(novo)
    localStorage.setItem('autoprint', String(novo))
  }

  function testarImpressao() {
    const mock = {
      id: 'test', numero: 'TESTE-001', nome: 'Cliente Teste', telefone: '(32) 99999-9999',
      pagamento: 'pix', total: 32.00, status: 'recebido', created_at: new Date().toISOString(),
      itens: JSON.stringify([{ nome: 'Pastel 2 Sabores', qtd: 1, preco: 18, sabores: ['Bacon', 'Queijo Mussarela'], adicionais: ['Catupiry'] }]),
    }
    imprimir(mock)
  }

  // Sidebar nav
  const pendentesCount = pedidos.filter(p => p.status === 'recebido' || p.status === 'preparando').length

  const NAV = [
    { id: 'dashboard', label: 'Fluxo de Caixa', icon: LayoutDashboard },
    { id: 'pedidos',   label: 'Pedidos',   icon: Package, badge: pendentesCount },
    { id: 'balcao',    label: 'Balcão',    icon: Store },
    { id: 'mesas',     label: 'Mesas',     icon: UtensilsCrossed },
    { id: 'catalogo',  label: 'Catálogo',  icon: Plus },
    { id: 'cardapio',  label: 'Cardápio',  icon: UtensilsCrossed },
    { id: 'estoque',   label: 'Estoque',   icon: BarChart2 },
    { id: 'clientes',   label: 'Clientes',   icon: Users },
    { id: 'caderneta',  label: 'Caderneta',  icon: BookOpen },
    { id: 'relatorios', label: 'Relatórios', icon: FileText },
    { id: 'whatsapp',  label: 'WhatsApp Bot', icon: MessageCircle },
    { id: 'config',    label: 'Config',    icon: Settings },
  ]

  const TITULOS = {
    dashboard:  'Fluxo de Caixa',
    pedidos:    'Pedidos ao Vivo',
    balcao:     'Venda no Balcão',
    mesas:      'Mesas Abertas',
    catalogo:   'Catálogo de Itens',
    cardapio:   'Cardapio',
    estoque:    'Estoque',
    clientes:   'Clientes',
    caderneta:  'Caderneta',
    relatorios: 'Relatorios',
    whatsapp:   'WhatsApp Bot',
    config:     'Configuracoes',
  }

  function navegar(id) {
    setPaginaAtiva(id)
    if (id === 'pedidos') setAlertasNovos([])
    if (isMobile()) {
      setMobileOverlay(false)
      setSidebarAberta(false)
    }
  }

  // ── LOGIN ────────────────────────────────────────────────────
  if (!logado) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{
          background: C.card, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${C.cardBorder}`, borderRadius: '24px', padding: '2.5rem',
          width: '100%', maxWidth: '380px', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <img
            src="/logo-carioca.png"
            alt="Pastel do Carioca"
            style={{ height: '80px', width: 'auto', objectFit: 'contain', marginBottom: '1rem', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.7))' }}
          />
          <h1 style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '3px', margin: '0 0 0.25rem' }}>
            Area Administrativa
          </h1>
          <p style={{ color: C.muted, fontSize: '0.82rem', margin: '0 0 1.75rem' }}>{CONFIG.nomeLoja}</p>
          <input
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="Senha de acesso"
            style={{
              width: '100%', padding: '0.75rem 1rem', borderRadius: '14px', fontSize: '0.95rem',
              background: 'rgba(255,235,235,0.70)', border: `1px solid ${errLogin ? C.danger : C.cardBorder}`,
              color: C.text, outline: 'none', marginBottom: '0.75rem', boxSizing: 'border-box',
            }}
          />
          {errLogin && (
            <p style={{ color: '#FF7777', fontSize: '0.82rem', marginBottom: '0.75rem', fontWeight: 700 }}>{errLogin}</p>
          )}
          <button
            onClick={login}
            style={{
              width: '100%', padding: '0.875rem', borderRadius: '14px', cursor: 'pointer',
              background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`,
              border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 800,
              boxShadow: '0 6px 20px rgba(229,57,53,0.4)',
            }}
          >
            Entrar
          </button>
        </div>
      </div>
    )
  }

  // ── PAINEL ───────────────────────────────────────────────────
  const larguraSidebar = sidebarAberta ? '240px' : '60px'

  return (
    <div id="admin-root-wrapper" style={{ minHeight: '100vh', display: 'flex', position: 'relative', background: 'linear-gradient(135deg, rgba(255,220,220,0.98) 0%, rgba(255,235,235,0.99) 50%, rgba(255,225,225,0.98) 100%)' }}>
      <style>{`
        /* Font scaling agressivo — rem cresce com viewport */
        html { font-size: clamp(17px, 1.5vw, 20px) !important; }

        /* Bold em tudo */
        #admin-root-wrapper, #admin-root-wrapper * {
          font-weight: 900 !important;
        }

        /* Contorno sutil: text-shadow em 4 direções nas letras (não afeta layout) */
        #admin-root-wrapper span,
        #admin-root-wrapper p,
        #admin-root-wrapper h1, #admin-root-wrapper h2, #admin-root-wrapper h3,
        #admin-root-wrapper h4, #admin-root-wrapper h5, #admin-root-wrapper h6,
        #admin-root-wrapper td, #admin-root-wrapper th,
        #admin-root-wrapper label,
        #admin-root-wrapper li {
          text-shadow:
            0.4px  0px   0px rgba(15,0,0,0.35),
           -0.4px  0px   0px rgba(15,0,0,0.35),
            0px    0.4px 0px rgba(15,0,0,0.35),
            0px   -0.4px 0px rgba(15,0,0,0.35);
        }

        /* Botões com fundo colorido: contorno branco translúcido */
        #admin-root-wrapper button span {
          text-shadow:
            0.3px  0px   0px rgba(255,255,255,0.2),
           -0.3px  0px   0px rgba(255,255,255,0.2),
            0px    0.3px 0px rgba(255,255,255,0.2),
            0px   -0.3px 0px rgba(255,255,255,0.2);
        }

        #admin-root-wrapper {
          min-height: 100vh;
        }

        /* Modais responsivos */
        #admin-root-wrapper [data-modal] {
          max-height: 92vh !important;
          overflow-y: auto !important;
          width: min(96vw, 520px) !important;
        }

        /* Scroll suave em painéis */
        #admin-root-wrapper ::-webkit-scrollbar { width: 5px; height: 5px; }
        #admin-root-wrapper ::-webkit-scrollbar-track { background: rgba(255,220,220,0.3); border-radius: 4px; }
        #admin-root-wrapper ::-webkit-scrollbar-thumb { background: rgba(160,0,0,0.35); border-radius: 4px; }
        #admin-root-wrapper ::-webkit-scrollbar-thumb:hover { background: rgba(160,0,0,0.55); }
      `}</style>

      {/* Print area (invisivel em tela) */}
      {pedidoImprimir && <PrintArea pedido={pedidoImprimir} />}

      {/* Toast (quando está na aba pedidos) */}
      {toast && paginaAtiva === 'pedidos' && (
        <div style={{
          position: 'fixed', top: '1.25rem', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(145deg, #3d0000, #6b0000)',
          border: `1px solid ${C.gold}`, color: C.gold,
          fontWeight: 800, fontSize: '0.9rem',
          padding: '0.75rem 1.5rem', borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 300, whiteSpace: 'nowrap',
          backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Bell size={14} /> {toast}
        </div>
      )}

      {/* Banner de alerta — visível em OUTRAS abas */}
      {alertasNovos.length > 0 && paginaAtiva !== 'pedidos' && (
        <div
          onClick={() => navegar('pedidos')}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
            background: 'linear-gradient(90deg, #8B0000, #CC0000, #8B0000)',
            backgroundSize: '200% 100%',
            animation: 'alertSlide 2s linear infinite, alertPulse 1s ease-in-out infinite',
            cursor: 'pointer',
            padding: '0.7rem 1.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
            boxShadow: '0 4px 24px rgba(229,57,53,0.7)',
            borderBottom: '2px solid #FF4444',
          }}
        >
          <Bell size={18} color="#fff" style={{ flexShrink: 0, animation: 'bellShake 0.5s ease-in-out infinite' }} />
          <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.95rem', letterSpacing: '0.5px' }}>
            🔴 {alertasNovos.length === 1
              ? `Novo pedido de ${alertasNovos[0].nome}!`
              : `${alertasNovos.length} novos pedidos aguardando!`
            }
          </span>
          <span style={{
            background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '8px', padding: '2px 10px', fontSize: '0.78rem', fontWeight: 700, color: '#fff',
          }}>
            Ver pedidos →
          </span>
        </div>
      )}

      {/* Indicador na aba Pedidos quando está nela e tem alertas pendentes */}
      {alertasNovos.length > 0 && paginaAtiva === 'pedidos' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
          background: 'linear-gradient(90deg, rgba(0,80,0,0.9), rgba(0,160,60,0.85), rgba(0,80,0,0.9))',
          padding: '0.4rem 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          borderBottom: '1px solid rgba(0,200,80,0.4)',
        }}>
          <span style={{ color: '#6aff9e', fontWeight: 800, fontSize: '0.82rem' }}>
            ✓ Visualizando {alertasNovos.length} novo{alertasNovos.length > 1 ? 's' : ''} pedido{alertasNovos.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Overlay mobile */}
      {mobileOverlay && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setMobileOverlay(false); setSidebarAberta(false) }}
        />
      )}

      {/* SIDEBAR */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 160,
        width: larguraSidebar,
        background: 'rgba(160,0,0,0.55)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(150,0,0,0.25)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.25s ease',
        overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{
          padding: sidebarAberta ? '1.25rem 1rem 1rem' : '1.25rem 0 1rem',
          borderBottom: '1px solid rgba(150,0,0,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: sidebarAberta ? 'space-between' : 'center',
          flexShrink: 0,
        }}>
          {sidebarAberta && (
            <div>
              <div style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem', letterSpacing: '2px', lineHeight: 1 }}>
                Pastel do Carioca
              </div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.65rem', marginTop: '2px' }}>Admin v2</div>
            </div>
          )}
          <button
            onClick={() => {
              const nova = !sidebarAberta
              setSidebarAberta(nova)
              if (nova && isMobile()) setMobileOverlay(true)
              if (!nova) setMobileOverlay(false)
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', color: C.muted,
              padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center',
            }}
          >
            {sidebarAberta ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Navegacao */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
          {NAV.map(item => {
            const ativo = paginaAtiva === item.id
            const temAlerta = item.id === 'pedidos' && alertasNovos.length > 0 && !ativo
            return (
              <button
                key={item.id}
                onClick={() => navegar(item.id)}
                title={!sidebarAberta ? item.label : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: sidebarAberta ? '0.75rem' : '0',
                  justifyContent: sidebarAberta ? 'flex-start' : 'center',
                  padding: sidebarAberta ? '0.65rem 1rem' : '0.65rem 0',
                  background: temAlerta
                    ? 'rgba(229,57,53,0.2)'
                    : ativo ? 'rgba(229,57,53,0.15)' : 'transparent',
                  border: 'none',
                  borderLeft: temAlerta
                    ? `3px solid #FF4444`
                    : ativo ? `3px solid ${C.red}` : '3px solid transparent',
                  cursor: 'pointer',
                  color: ativo ? '#fff' : 'rgba(255,255,255,0.92)',
                  fontSize: '0.9rem', fontWeight: 900,
                  transition: 'all 0.15s',
                  textAlign: 'left', position: 'relative',
                  animation: temAlerta ? 'pulseBorder 1s ease-in-out infinite' : 'none',
                }}
                onMouseEnter={e => { if (!ativo && !temAlerta) e.currentTarget.style.background = 'rgba(180,0,0,0.18)' }}
                onMouseLeave={e => { if (!ativo && !temAlerta) e.currentTarget.style.background = 'transparent' }}
              >
                <item.icon
                  size={18}
                  color={temAlerta ? '#FFD0D0' : ativo ? '#fff' : 'rgba(255,255,255,0.80)'}
                  style={{ flexShrink: 0, animation: temAlerta ? 'bellShake 0.6s ease-in-out infinite' : 'none' }}
                />
                {sidebarAberta && (
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                )}
                {/* Badge normal (pendentes) */}
                {item.badge > 0 && !temAlerta && sidebarAberta && (
                  <span style={{
                    background: C.red, color: '#fff', borderRadius: '999px',
                    fontSize: '0.65rem', fontWeight: 900, padding: '1px 6px', flexShrink: 0,
                  }}>
                    {item.badge}
                  </span>
                )}
                {/* Badge de alerta (novos não vistos) */}
                {temAlerta && sidebarAberta && (
                  <span style={{
                    background: '#FF4444', color: '#fff', borderRadius: '999px',
                    fontSize: '0.65rem', fontWeight: 900, padding: '1px 8px', flexShrink: 0,
                    animation: 'badgePulseRed 0.8s ease-in-out infinite',
                    boxShadow: '0 0 8px rgba(255,68,68,0.7)',
                  }}>
                    {alertasNovos.length} novo{alertasNovos.length > 1 ? 's' : ''}
                  </span>
                )}
                {(item.badge > 0 || temAlerta) && !sidebarAberta && (
                  <span style={{
                    position: 'absolute', top: '8px', right: '6px',
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: temAlerta ? '#FF4444' : C.red,
                    animation: temAlerta ? 'badgePulseRed 0.8s ease-in-out infinite' : 'none',
                    boxShadow: temAlerta ? '0 0 6px rgba(255,68,68,0.8)' : 'none',
                  }} />
                )}
              </button>
            )
          })}
        </nav>

        {/* Rodape sidebar */}
        <div style={{ padding: '0.75rem 0', borderTop: '1px solid rgba(150,0,0,0.20)', flexShrink: 0 }}>
          {/* Toggle autoprint */}
          <button
            onClick={toggleAutoprint}
            title={!sidebarAberta ? (autoprint ? 'Autoprint ON' : 'Autoprint OFF') : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: sidebarAberta ? '0.75rem' : '0',
              justifyContent: sidebarAberta ? 'flex-start' : 'center',
              padding: sidebarAberta ? '0.6rem 1rem' : '0.6rem 0',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.88)', fontSize: '0.82rem',
            }}
          >
            <Printer size={16} color={autoprint ? '#6aff9e' : 'rgba(255,255,255,0.75)'} style={{ flexShrink: 0 }} />
            {sidebarAberta && <span>Autoprint {autoprint ? 'ON' : 'OFF'}</span>}
          </button>

          {/* Sair */}
          <button
            onClick={() => { setLogado(false); setSenha(''); sessionStorage.removeItem('carioca_admin') }}
            title={!sidebarAberta ? 'Sair' : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: sidebarAberta ? '0.75rem' : '0',
              justifyContent: sidebarAberta ? 'flex-start' : 'center',
              padding: sidebarAberta ? '0.6rem 1rem' : '0.6rem 0',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.88)', fontSize: '0.82rem',
            }}
          >
            <LogOut size={16} color="rgba(255,255,255,0.75)" style={{ flexShrink: 0 }} />
            {sidebarAberta && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* CONTEUDO PRINCIPAL */}
      <div style={{
        flex: 1,
        marginLeft: larguraSidebar,
        transition: 'margin-left 0.25s ease',
        display: 'flex', flexDirection: 'column',
        minHeight: '100vh',
      }}>

        {/* TOPBAR */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'rgba(255,235,235,0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          padding: '0.75rem 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        }}>
          {/* Esquerda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Hamburger mobile */}
            <button
              onClick={() => {
                const nova = !sidebarAberta
                setSidebarAberta(nova)
                setMobileOverlay(nova && isMobile())
              }}
              style={{
                display: isMobile() ? 'flex' : 'none',
                background: 'none', border: 'none', cursor: 'pointer', color: C.muted,
                alignItems: 'center', padding: '4px',
              }}
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 style={{ color: C.text, fontWeight: 800, fontSize: '1rem', margin: 0 }}>
                {TITULOS[paginaAtiva]}
              </h2>
              <div style={{ color: C.muted, fontSize: '0.68rem', marginTop: '1px' }}>
                {CONFIG.nomeLoja}
              </div>
            </div>
          </div>

          {/* Direita */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            {carregando && (
              <RefreshCw size={14} color={C.muted} style={{ animation: 'spin 1s linear infinite' }} />
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', borderRadius: '20px',
              background: autoprint ? 'rgba(0,200,80,0.12)' : 'rgba(255,235,235,0.70)',
              border: `1px solid ${autoprint ? 'rgba(0,200,80,0.25)' : C.cardBorder}`,
              cursor: 'pointer',
            }} onClick={toggleAutoprint}>
              <Printer size={12} color={autoprint ? C.success : C.muted} />
              <span style={{ color: autoprint ? C.success : C.muted, fontSize: '0.68rem', fontWeight: 700 }}>
                {autoprint ? 'AUTO ON' : 'AUTO OFF'}
              </span>
            </div>
            <div style={{ color: C.muted, fontSize: '0.75rem', fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '1px' }}>
              {horaAtual}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main style={{ flex: 1, padding: '1.5rem', minWidth: 0 }}>
          {paginaAtiva === 'dashboard' && (
            <PaginaDashboard pedidos={pedidos} onVerPedidos={() => navegar('pedidos')} onExcluir={excluirPedido} onSalvarPedido={salvarPedido} carregarPedidos={carregarPedidos} onImprimir={imprimir} />
          )}
          {paginaAtiva === 'pedidos' && (
            <PaginaPedidos
              pedidos={pedidos}
              novosIds={new Set(alertasNovos.map(a => a.id))}
              onStatus={atualizarStatus}
              onImprimir={imprimir}
              onExcluir={excluirPedido}
              onAtualizar={() => carregarPedidos()}
              onCarregarData={(data) => carregarPedidos(false, data)}
              onFinalizar={p => setCheckoutPedido(p)}
            />
          )}
          {paginaAtiva === 'balcao' && (
            <PaginaBalcao
              onPedidoCriado={() => { setMesaAdicionando(null); carregarPedidos(true) }}
              onCaderneta={() => setCadernetaKey(k => k + 1)}
              mesaAdicionando={mesaAdicionando}
              onCancelarMesa={() => { setMesaAdicionando(null); setPaginaAtiva('mesas') }}
            />
          )}
          {paginaAtiva === 'mesas' && (
            <PaginaMesas pedidos={pedidos} onAtualizar={() => carregarPedidos(true)} onAdicionarItens={adicionarItensMesaAdmin} />
          )}
          {paginaAtiva === 'catalogo' && <PaginaCatalogo />}
          {paginaAtiva === 'cardapio' && (
            <PaginaCardapio config={configLoja} onSalvar={salvarConfig} />
          )}
          {paginaAtiva === 'estoque' && <PaginaEstoque />}
          {paginaAtiva === 'clientes' && <PaginaClientes />}
          {paginaAtiva === 'caderneta' && <PaginaCaderneta key={cadernetaKey} />}
          {paginaAtiva === 'relatorios' && <PaginaRelatorios />}
          {paginaAtiva === 'whatsapp' && <PaginaWhatsApp />}
          {paginaAtiva === 'config' && (
            <PaginaConfiguracoes
              autoprint={autoprint}
              onToggleAutoprint={toggleAutoprint}
              onTestarImpressao={testarImpressao}
              config={configLoja}
              onSalvar={salvarConfig}
            />
          )}
        </main>
      </div>

      {/* Modal Checkout */}
      {checkoutPedido !== null && <ModalCheckout pedido={checkoutPedido} onFechar={() => setCheckoutPedido(null)} onConfirmar={fecharCheckout} enviando={fechandoCheckout} senhaAdmin={configLoja?.senha_desconto} />}

      {/* Estilos globais injetados */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes novoPedidoPulse { 0%,100% { box-shadow: 0 0 8px rgba(33,150,243,0.3); } 50% { box-shadow: 0 0 24px rgba(33,150,243,0.6), 0 0 48px rgba(33,150,243,0.2); } }
        @keyframes pulseBorder { 0%,100% { box-shadow: 0 0 0 0 rgba(229,57,53,0); } 50% { box-shadow: 0 0 0 6px rgba(229,57,53,0.25); } }
        @keyframes alertSlide { 0% { background-position: 0% 0%; } 100% { background-position: 200% 0%; } }
        @keyframes alertPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.88; } }
        @keyframes bellShake { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-15deg); } 75% { transform: rotate(15deg); } }
        @keyframes badgePulseRed { 0%,100% { box-shadow: 0 0 0 0 rgba(255,68,68,0.8); transform: scale(1); } 50% { box-shadow: 0 0 0 4px rgba(255,68,68,0); transform: scale(1.15); } }
        @media print {
          body * { visibility: hidden !important; }
          #print-area { display: block !important; visibility: visible !important; position: fixed; top: 0; left: 0; width: 80mm; z-index: 99999; background: #fff !important; }
          #print-area * { visibility: visible !important; }
        }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(229,57,53,0.4); border-radius: 2px; }
        tbody tr:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>
    </div>
  )
}
