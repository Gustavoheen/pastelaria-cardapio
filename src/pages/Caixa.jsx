import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ShoppingCart, Package, ChevronRight, ChevronLeft, Check,
  RefreshCw, Bell, X, Plus, Minus, Banknote, LogOut,
  Store, ClipboardList, Trash2, UtensilsCrossed, Coffee,
} from 'lucide-react'
import { CONFIG } from '../config.js'
import {
  TIPOS_PASTEL, PASTEIS_DOCES, categorias,
  SABORES_SALGADOS, SABORES_DOCES, ADICIONAIS_LISTA,
} from '../data/cardapio.js'

// ── Paleta ──────────────────────────────────────────────────────
const C = {
  bg:         'rgba(255,235,235,0.88)',
  card:       'rgba(255,255,255,0.82)',
  border:     'rgba(180,0,0,0.22)',
  red:        '#C62828',
  redDark:    '#8B0000',
  gold:       '#92400E',
  text:       '#1A0000',
  muted:      'rgba(15,0,0,0.82)',
  success:    '#166534',
  warning:    '#92400E',
  danger:     '#991B1B',
}

// ── Status ───────────────────────────────────────────────────────
const STATUS_FLOW = {
  recebido:   { label: 'Recebido',   cor: '#F5C800', proximo: 'preparando', anterior: null,         rotuloAvanco: 'Iniciar preparo' },
  preparando: { label: 'Preparando', cor: '#CC0000', proximo: 'pronto',     anterior: 'recebido',   rotuloAvanco: 'Marcar pronto' },
  pronto:     { label: 'Pronto',     cor: '#00c853', proximo: 'entregue',   anterior: 'preparando', rotuloAvanco: 'Marcar retirado' },
  entregue:   { label: 'Retirado',   cor: '#888',    proximo: null,         anterior: 'pronto',     rotuloAvanco: null },
}

// ── Beep (AudioContext, 800Hz, 1s, max volume) ───────────────────
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

// ── Helpers ───────────────────────────────────────────────────────
function fmtMoeda(v) { return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}` }
function somarCart(cart) {
  const centavos = cart.reduce((s, i) => s + Math.round(Number(i.preco || 0) * 100) * Number(i.qtd || 1), 0)
  return centavos / 100
}
function fmtHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function minutosAtras(iso) {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso)) / 60000)
}
function parseItens(raw) {
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw || '[]') } catch (_) { return [] }
}
function ehHoje(iso) {
  if (!iso) return false
  return new Date(iso).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
}

// ── Hook timer ────────────────────────────────────────────────────
function useTimer(createdAt) {
  const [min, setMin] = useState(() => minutosAtras(createdAt))
  useEffect(() => {
    const id = setInterval(() => setMin(minutosAtras(createdAt)), 1000)
    return () => clearInterval(id)
  }, [createdAt])
  return min
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CARD DE PEDIDO (mobile)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CardPedido({ pedido, onStatus, onFinalizar }) {
  const min = useTimer(pedido.created_at)
  const info = STATUS_FLOW[pedido.status] || STATUS_FLOW.recebido
  const corTempo = min < 10 ? C.success : min < 20 ? C.warning : C.danger
  const itens = parseItens(pedido.itens)

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${info.cor}44`,
      borderLeft: `4px solid ${info.cor}`,
      borderRadius: '16px',
      overflow: 'hidden',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      {/* Header do card */}
      <div style={{
        padding: '0.75rem 1rem',
        background: `${info.cor}12`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            color: C.text, fontFamily: 'Bebas Neue, sans-serif',
            fontSize: '1.1rem', letterSpacing: '2px',
          }}>
            #{pedido.numero}
          </span>
          <span style={{
            background: info.cor + '28', color: info.cor,
            border: `1px solid ${info.cor}55`,
            fontSize: '0.62rem', fontWeight: 700,
            padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase',
          }}>
            {info.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            color: corTempo, fontSize: '0.7rem', fontWeight: 700,
            background: corTempo + '18', border: `1px solid ${corTempo}44`,
            borderRadius: '20px', padding: '2px 8px',
          }}>
            {min}min
          </span>
          <span style={{ color: C.gold, fontWeight: 800, fontSize: '0.88rem' }}>
            {fmtMoeda(pedido.total)}
          </span>
        </div>
      </div>

      {/* Cliente + itens */}
      <div style={{ padding: '0.625rem 1rem' }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: '0.85rem', marginBottom: '2px' }}>
          {pedido.nome}
          {pedido.nome !== 'Balcão' && pedido.telefone !== '00000000000' && (
            <span style={{ color: C.muted, fontWeight: 500, fontSize: '0.75rem', marginLeft: '6px' }}>
              {pedido.telefone}
            </span>
          )}
        </div>
        <div style={{ color: C.muted, fontSize: '0.75rem', lineHeight: 1.4 }}>
          {itens.map((it, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {it.qtd || 1}x {it.nome}
              {it.sabores?.length > 0 && ` (${it.sabores.join(', ')})`}
            </span>
          ))}
        </div>
        <div style={{ color: C.muted, fontSize: '0.7rem', marginTop: '2px' }}>
          {fmtHora(pedido.created_at)} · {pedido.pagamento?.toUpperCase()}
        </div>
        {Number(pedido.desconto_valor) > 0 && (
          <div style={{ color: '#ff6b6b', fontSize: '0.7rem', marginTop: '2px', fontWeight: 700 }}>
            Desconto: -{fmtMoeda(pedido.desconto_valor)}{pedido.desconto_obs ? ` — ${pedido.desconto_obs}` : ''}
          </div>
        )}
      </div>

      {/* Botões de ação */}
      <div style={{ padding: '0.5rem 1rem 0.75rem', display: 'flex', gap: '0.5rem' }}>
        {info.anterior && (
          <button
            onClick={() => onStatus(pedido.id, info.anterior)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '0.6rem 0.875rem', borderRadius: '10px', cursor: 'pointer',
              background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
              color: C.muted, fontSize: '0.78rem', fontWeight: 600,
            }}
          >
            <ChevronLeft size={14} /> Voltar
          </button>
        )}
        {info.proximo && info.proximo !== 'entregue' && (
          <button
            onClick={() => onStatus(pedido.id, info.proximo)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '0.7rem', borderRadius: '10px', cursor: 'pointer',
              background: `linear-gradient(145deg, ${info.cor}, ${info.cor}bb)`,
              border: 'none', color: '#fff',
              fontSize: '0.88rem', fontWeight: 800,
              boxShadow: `0 4px 14px ${info.cor}44`,
            }}
          >
            {info.rotuloAvanco} <ChevronRight size={14} />
          </button>
        )}
        {info.proximo === 'entregue' && (
          <button
            onClick={() => onFinalizar(pedido)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '0.7rem', borderRadius: '10px', cursor: 'pointer',
              background: `linear-gradient(145deg, ${C.success}, #009940)`,
              border: 'none', color: '#fff',
              fontSize: '0.88rem', fontWeight: 800,
              boxShadow: `0 4px 14px rgba(0,200,80,0.3)`,
            }}
          >
            Finalizar venda <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ABA PEDIDOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AbaPedidos({ pedidos, onStatus, onAtualizar, carregando, onFinalizar }) {
  const [filtro, setFiltro] = useState('ativos')

  const ativos = pedidos.filter(p => ['recebido', 'preparando', 'pronto'].includes(p.status))
  const entregues = pedidos.filter(p => p.status === 'entregue' && ehHoje(p.created_at))
  const lista = filtro === 'ativos' ? ativos : entregues

  const kpis = {
    recebido:   pedidos.filter(p => p.status === 'recebido').length,
    preparando: pedidos.filter(p => p.status === 'preparando').length,
    pronto:     pedidos.filter(p => p.status === 'pronto').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
        {[
          { label: 'Recebidos', val: kpis.recebido,   cor: '#F5C800' },
          { label: 'Preparando', val: kpis.preparando, cor: '#CC0000' },
          { label: 'Prontos',   val: kpis.pronto,     cor: '#00c853' },
        ].map(k => (
          <div key={k.label} style={{
            background: C.card, border: `1px solid ${k.cor}33`,
            borderRadius: '12px', padding: '0.625rem 0.5rem', textAlign: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{
              color: k.cor, fontFamily: 'Bebas Neue, sans-serif',
              fontSize: '1.6rem', lineHeight: 1,
            }}>{k.val}</div>
            <div style={{ color: C.muted, fontSize: '0.65rem', fontWeight: 700, marginTop: '1px' }}>
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filtro + atualizar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {['ativos', 'entregues'].map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              padding: '0.4rem 0.875rem', borderRadius: '20px', cursor: 'pointer',
              fontSize: '0.78rem', fontWeight: 700, border: 'none',
              background: filtro === f ? C.red : 'rgba(255,235,235,0.70)',
              color: filtro === f ? '#fff' : C.muted,
            }}
          >
            {f === 'ativos' ? `Ativos (${ativos.length})` : `Entregues (${entregues.length})`}
          </button>
        ))}
        <button
          onClick={onAtualizar}
          style={{
            marginLeft: 'auto', padding: '0.4rem 0.75rem', borderRadius: '20px', cursor: 'pointer',
            background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
            color: C.muted, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem',
          }}
        >
          <RefreshCw size={12} style={{ animation: carregando ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: '16px', padding: '2.5rem', textAlign: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          <Package size={32} style={{ color: C.muted, opacity: 0.4, marginBottom: '0.5rem' }} />
          <p style={{ color: C.muted, margin: 0, fontSize: '0.85rem' }}>
            {filtro === 'ativos' ? 'Sem pedidos ativos' : 'Sem entregas hoje'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {lista.map(p => (
            <CardPedido key={p.id} pedido={p} onStatus={onStatus} onFinalizar={onFinalizar} />
          ))}
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHEET DE SABORES (slide-up mobile)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SheetSabores({ tipo, onFechar, onAdicionar }) {
  const [sabores, setSabores] = useState([])
  const [adicionais, setAdicionais] = useState([])
  const [obs, setObs] = useState('')

  if (!tipo) return null

  const lista = tipo.tipo === 'doce' ? SABORES_DOCES : SABORES_SALGADOS
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
    if (!sabores.length) return
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

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onFechar}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '88vh', overflowY: 'auto',
          background: 'rgba(255,240,240,0.97)',
          borderRadius: '24px 24px 0 0',
          border: `1px solid ${C.border}`,
          padding: '0.75rem 1.25rem 2rem',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Handle */}
        <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', margin: '0 auto 1rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: '1rem' }}>{tipo.nome}</div>
            <div style={{ color: C.gold, fontWeight: 700 }}>{fmtMoeda(tipo.preco)}</div>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px' }}>
            <X size={22} />
          </button>
        </div>

        {/* Sabores */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
            Sabores ({sabores.length}/{tipo.maxSabores})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {lista.map(s => {
              const sel = sabores.includes(s)
              const bloq = !sel && sabores.length >= tipo.maxSabores
              return (
                <button key={s} onClick={() => toggleSabor(s)} disabled={bloq} style={{
                  padding: '8px 14px', borderRadius: '20px', cursor: bloq ? 'default' : 'pointer',
                  fontSize: '0.82rem', fontWeight: sel ? 700 : 500, border: 'none',
                  background: sel ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.75)',
                  color: sel ? '#fff' : bloq ? 'rgba(15,0,0,0.75)' : C.text,
                }}>
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        {/* Adicionais */}
        {maxAd > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: C.muted, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
              Adicionais grátis ({adicionais.length}/{maxAd})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {ADICIONAIS_LISTA.map(a => {
                const sel = adicionais.includes(a)
                const bloq = !sel && adicionais.length >= maxAd
                return (
                  <button key={a} onClick={() => toggleAd(a)} disabled={bloq} style={{
                    padding: '8px 14px', borderRadius: '20px', cursor: bloq ? 'default' : 'pointer',
                    fontSize: '0.82rem', fontWeight: sel ? 700 : 500, border: 'none',
                    background: sel ? 'rgba(245,200,0,0.25)' : 'rgba(255,235,235,0.75)',
                    color: sel ? C.gold : bloq ? 'rgba(15,0,0,0.75)' : C.text,
                  }}>
                    {a}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Obs */}
        <div style={{ marginBottom: '1.25rem' }}>
          <input
            type="text"
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Observação (opcional)"
            style={{
              width: '100%', padding: '0.7rem 0.875rem', borderRadius: '12px', fontSize: '0.88rem',
              background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
              color: C.text, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Confirmar */}
        <button
          onClick={confirmar}
          disabled={!sabores.length}
          style={{
            width: '100%', padding: '1rem', borderRadius: '14px', cursor: sabores.length ? 'pointer' : 'not-allowed',
            fontSize: '1rem', fontWeight: 800, border: 'none',
            background: sabores.length ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.75)',
            color: sabores.length ? '#fff' : C.muted,
            boxShadow: sabores.length ? `0 6px 20px rgba(229,57,53,0.4)` : 'none',
          }}
        >
          Adicionar ao Carrinho
        </button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHEET DO CARRINHO (slide-up mobile)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SheetCarrinho({ aberto, onFechar, cart, onRemover, subtotal, onConfirmar, enviando, modo, mesaAdicionando }) {
  const [nome, setNome] = useState('')

  if (!aberto) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onFechar}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '92vh', overflowY: 'auto',
          background: 'rgba(255,240,240,0.97)',
          borderRadius: '24px 24px 0 0',
          border: `1px solid ${C.border}`,
          padding: '0.75rem 1.25rem 2.5rem',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Handle */}
        <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', margin: '0 auto 1rem' }} />

        {/* Título */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShoppingCart size={18} color={C.red} />
            <span style={{ color: C.text, fontWeight: 800, fontSize: '1rem' }}>Carrinho</span>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
            <X size={22} />
          </button>
        </div>

        {/* Itens */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1rem' }}>
          {cart.map(item => (
            <div key={item.chave} style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '8px 10px', borderRadius: '10px',
              background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.border}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: '0.85rem', fontWeight: 700 }}>
                  {item.qtd > 1 ? `${item.qtd}x ` : ''}{item.nome}
                </div>
                {item.sabores?.length > 0 && (
                  <div style={{ color: C.muted, fontSize: '0.72rem' }}>{item.sabores.join(', ')}</div>
                )}
                {item.adicionais?.length > 0 && (
                  <div style={{ color: 'rgba(245,200,0,0.65)', fontSize: '0.72rem' }}>+ {item.adicionais.join(', ')}</div>
                )}
                {item.observacao && (
                  <div style={{ color: C.muted, fontSize: '0.7rem', fontStyle: 'italic' }}>{item.observacao}</div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ color: C.gold, fontWeight: 700, fontSize: '0.85rem' }}>
                  {fmtMoeda(item.preco * item.qtd)}
                </div>
                <button onClick={() => onRemover(item.chave)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,100,100,0.55)', fontSize: '0.7rem', padding: 0, marginTop: '2px',
                }}>
                  remover
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.625rem 0', borderTop: `1px solid ${C.border}`, marginBottom: '1rem',
        }}>
          <span style={{ color: C.muted, fontWeight: 600 }}>Total</span>
          <span style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.6rem', letterSpacing: '1px' }}>
            {fmtMoeda(subtotal)}
          </span>
        </div>

        {!mesaAdicionando && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
            Cliente (opcional)
          </label>
          <input
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder={modo === 'local' ? 'Nome da mesa' : 'Nome do cliente'}
            style={{
              width: '100%', padding: '0.7rem 0.875rem', borderRadius: '12px', fontSize: '0.88rem',
              background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
              color: C.text, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        )}

        {/* Confirmar */}
        <button
          onClick={() => onConfirmar({ nome })}
          disabled={enviando}
          style={{
            width: '100%', padding: '1rem', borderRadius: '14px',
            cursor: enviando ? 'not-allowed' : 'pointer',
            fontSize: '1rem', fontWeight: 800, border: 'none',
            background: enviando
              ? 'rgba(255,235,235,0.75)'
              : `linear-gradient(145deg, ${C.gold}, #d4a800)`,
            color: enviando ? C.muted : '#1a1000',
            boxShadow: !enviando ? '0 6px 20px rgba(245,200,0,0.3)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          {enviando
            ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Registrando...</>
            : mesaAdicionando
              ? <><Plus size={16} /> Adicionar a mesa #{mesaAdicionando.numero} — {fmtMoeda(subtotal)}</>
              : modo === 'local'
                ? <><UtensilsCrossed size={16} /> Abrir conta — {fmtMoeda(subtotal)}</>
                : <><ShoppingCart size={16} /> Registrar pedido — {fmtMoeda(subtotal)}</>
          }
        </button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ABA BALCÃO (mobile)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AbaBalcao({ onPedidoCriado, modo, setModo, mesaAdicionando, onCancelarMesa }) {
  const [secao, setSecao] = useState('pasteis')
  const [cart, setCart] = useState([])
  const [tipoSabores, setTipoSabores] = useState(null)
  const [cartAberto, setCartAberto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(null)
  const [bebidaSaboresMap, setBebidaSaboresMap] = useState({})
  const [cardapioState, setCardapioState] = useState(null)

  useEffect(() => {
    fetch('/api/bebidas-sabores').then(r => r.json()).then(rows => {
      if (!Array.isArray(rows)) return
      const map = {}
      rows.forEach(r => { map[r.bebida_id] = r.sabores })
      setBebidaSaboresMap(map)
    }).catch(() => {})
    // Buscar preços e itens desativados do admin
    fetch('/api/cardapio-state').then(r => r.json()).then(cfg => {
      if (cfg && typeof cfg === 'object') setCardapioState(cfg)
    }).catch(() => {})
  }, [])

  // Aplicar preços do admin sobre os dados estáticos
  const precos = cardapioState?.precos || {}
  const desativados = cardapioState?.desativados || []
  const tiposPastelAtivos = TIPOS_PASTEL
    .filter(t => !desativados.includes(t.id))
    .map(t => ({ ...t, preco: precos[t.id] ?? t.preco }))
  const pasteisDocesAtivos = PASTEIS_DOCES
    .filter(d => !desativados.includes(d.id))
    .map(d => ({ ...d, preco: precos[d.id] ?? d.preco }))
  const bebidasAtivas = (categorias[0]?.itens || [])
    .filter(b => !desativados.includes(b.id))
    .map(b => ({ ...b, preco: precos[b.id] ?? b.preco }))

  // Item avulso
  const [avNome, setAvNome] = useState('')
  const [avPreco, setAvPreco] = useState('')

  const subtotal = somarCart(cart)
  const totalItens = cart.reduce((s, i) => s + i.qtd, 0)

  function addPastel(item) { setCart(prev => [...prev, item]) }

  function addBebida(beb) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.chave === `beb-${beb.id}`)
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qtd: i.qtd + 1 } : i)
      return [...prev, { chave: `beb-${beb.id}`, tipoId: 'bebida', nome: beb.nome, preco: beb.preco, qtd: 1 }]
    })
  }
  function remBebida(bebId) {
    setCart(prev => {
      const chave = `beb-${bebId}`
      const item = prev.find(i => i.chave === chave)
      if (!item) return prev
      if (item.qtd > 1) return prev.map(i => i.chave === chave ? { ...i, qtd: i.qtd - 1 } : i)
      return prev.filter(i => i.chave !== chave)
    })
  }
  function qtdBeb(bebId) { return cart.find(i => i.chave === `beb-${bebId}`)?.qtd || 0 }
  function remItem(chave) { setCart(prev => prev.filter(i => i.chave !== chave)) }

  function addDoce(doce) {
    setCart(prev => {
      const chave = `doce-${doce.id}`
      const idx = prev.findIndex(i => i.chave === chave)
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qtd: i.qtd + 1 } : i)
      return [...prev, { chave, tipoId: 'doce', nome: `Pastel ${doce.nome}`, sabores: [doce.nome], adicionais: [], observacao: '', preco: doce.preco, qtd: 1 }]
    })
  }
  function remDoce(doceId) {
    setCart(prev => {
      const chave = `doce-${doceId}`
      const item = prev.find(i => i.chave === chave)
      if (!item) return prev
      if (item.qtd > 1) return prev.map(i => i.chave === chave ? { ...i, qtd: i.qtd - 1 } : i)
      return prev.filter(i => i.chave !== chave)
    })
  }
  function qtdDoce(doceId) { return cart.find(i => i.chave === `doce-${doceId}`)?.qtd || 0 }

  function addBebidaSabor(beb, sabor) {
    setCart(prev => {
      const chave = `beb-${beb.id}-${sabor}`
      const idx = prev.findIndex(i => i.chave === chave)
      if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qtd: i.qtd + 1 } : i)
      return [...prev, { chave, tipoId: 'bebida', nome: `${beb.nome} ${sabor}`, preco: beb.preco, qtd: 1 }]
    })
  }
  function remBebidaSabor(bebId, sabor) {
    setCart(prev => {
      const chave = `beb-${bebId}-${sabor}`
      const item = prev.find(i => i.chave === chave)
      if (!item) return prev
      if (item.qtd > 1) return prev.map(i => i.chave === chave ? { ...i, qtd: i.qtd - 1 } : i)
      return prev.filter(i => i.chave !== chave)
    })
  }
  function qtdBebSabor(bebId, sabor) { return cart.find(i => i.chave === `beb-${bebId}-${sabor}`)?.qtd || 0 }

  function addAvulso() {
    const nome = avNome.trim()
    const preco = parseFloat(String(avPreco).replace(',', '.'))
    if (!nome || !(preco > 0)) return
    setCart(prev => [...prev, { chave: `avulso-${Date.now()}`, tipoId: 'avulso', nome, preco, qtd: 1 }])
    setAvNome('')
    setAvPreco('')
  }

  async function confirmarVenda({ nome }) {
    setEnviando(true)
    const isLocal = modo === 'local'
    const subtotalOriginal = somarCart(cart)
    try {
      // ── ADICIONANDO ITENS A MESA EXISTENTE ──
      if (mesaAdicionando) {
        const itensExistentes = parseItens(mesaAdicionando.itens)
        const novosItens = cart.map(i => ({
          tipoId: i.tipoId, nome: i.nome, preco: i.preco, qtd: i.qtd,
          sabores: i.sabores || [], adicionais: i.adicionais || [], observacao: i.observacao || '',
        }))
        const todosItens = [...itensExistentes, ...novosItens]
        const novoTotal = somarCart(todosItens)

        const res = await fetch('/api/pedido', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: mesaAdicionando.id,
            itens: todosItens,
            total: novoTotal,
            subtotal: novoTotal,
          }),
        })
        if (res.ok) {
          setSucesso({ numero: mesaAdicionando.numero, modo: 'adicionado' })
          setCart([])
          setCartAberto(false)
          onPedidoCriado?.()
          setTimeout(() => setSucesso(null), 5000)
        }
        setEnviando(false)
        return
      }

      // ── NOVO PEDIDO (entra na fila como recebido — checkout na aba Pedidos) ──
      const obsPrefix = isLocal ? '\ud83c\udf7d\ufe0f COMER NO LOCAL' : '\ud83d\udce6 LEVAR'
      const body = {
        nome: nome?.trim() || (isLocal ? 'Mesa' : 'Balcao'),
        telefone: '00000000000',
        pagamento: 'pendente',
        itens: cart.map(i => ({
          tipoId: i.tipoId, nome: i.nome, preco: i.preco, qtd: i.qtd,
          sabores: i.sabores || [], adicionais: i.adicionais || [], observacao: i.observacao || '',
        })),
        subtotal: subtotalOriginal, total: subtotalOriginal, origem: 'balcao',
        observacao: obsPrefix,
        tipo_entrega: isLocal ? 'local' : 'levar',
      }
      const res = await fetch('/api/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const pedido = await res.json()
        setSucesso({ numero: pedido.numero, modo: isLocal ? 'local' : 'levar' })
        setCart([])
        setCartAberto(false)
        onPedidoCriado?.()
        setTimeout(() => setSucesso(null), 5000)
      }
    } catch (_) {}
    setEnviando(false)
  }

  const SECOES = ['pasteis', 'bebidas', 'avulso']

  const inputStyle = {
    padding: '0.7rem 0.875rem', borderRadius: '12px', fontSize: '0.88rem',
    background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', paddingBottom: totalItens > 0 ? '5rem' : '0' }}>

      {/* Banner: Adicionando itens a mesa */}
      {mesaAdicionando && (
        <div style={{
          background: 'rgba(0,120,255,0.18)', border: '1px solid rgba(0,120,255,0.5)',
          borderRadius: '12px', padding: '0.75rem 1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UtensilsCrossed size={16} color="#4da6ff" />
            <div>
              <div style={{ color: '#4da6ff', fontWeight: 800, fontSize: '0.88rem' }}>
                Adicionando itens — #{mesaAdicionando.numero}
              </div>
              <div style={{ color: 'rgba(77,166,255,0.7)', fontSize: '0.72rem' }}>
                {mesaAdicionando.nome} · {fmtMoeda(mesaAdicionando.total)}
              </div>
            </div>
          </div>
          <button onClick={onCancelarMesa} style={{
            padding: '0.4rem 0.75rem', borderRadius: '8px', cursor: 'pointer',
            background: 'rgba(255,80,80,0.15)', border: '1px solid rgba(255,80,80,0.4)',
            color: '#ff7777', fontSize: '0.75rem', fontWeight: 700,
          }}>Cancelar</button>
        </div>
      )}

      {/* Sucesso */}
      {sucesso && (
        <div style={{
          background: sucesso.modo === 'caderneta' ? 'rgba(179,92,0,0.15)' : sucesso.modo === 'adicionado' ? 'rgba(0,200,80,0.15)' : (sucesso.modo === 'local' ? 'rgba(0,120,255,0.15)' : 'rgba(0,200,80,0.15)'),
          border: `1px solid ${sucesso.modo === 'caderneta' ? 'rgba(179,92,0,0.5)' : sucesso.modo === 'local' ? 'rgba(0,120,255,0.4)' : 'rgba(0,200,80,0.4)'}`,
          borderRadius: '12px', padding: '0.75rem 1rem',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {sucesso.modo === 'local'
            ? <UtensilsCrossed size={16} color="#4da6ff" />
            : <Check size={16} color={sucesso.modo === 'caderneta' ? '#f5a623' : C.success} />
          }
          <div>
            <div style={{ color: sucesso.modo === 'caderneta' ? '#f5a623' : sucesso.modo === 'local' ? '#4da6ff' : C.success, fontWeight: 800, fontSize: '0.88rem' }}>
              {sucesso.modo === 'caderneta' ? '📒 Anotado na caderneta!' : sucesso.modo === 'adicionado' ? 'Itens adicionados!' : (sucesso.modo === 'local' ? 'Conta aberta!' : 'Venda registrada!')}
            </div>
            <div style={{ color: sucesso.modo === 'caderneta' ? 'rgba(245,166,35,0.7)' : sucesso.modo === 'local' ? 'rgba(77,166,255,0.7)' : 'rgba(0,200,80,0.7)', fontSize: '0.72rem' }}>
              {sucesso.modo === 'caderneta' ? `Cliente: ${sucesso.numero}` : `Pedido #${sucesso.numero} ${sucesso.modo === 'local' ? '- Aba "Mesas" para gerenciar' : (sucesso.modo === 'adicionado' ? '- Itens adicionados à mesa' : '')}`}
            </div>
          </div>
        </div>
      )}

      {/* Toggle Local / Levar */}
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

      {/* Tabs das secoes */}
      <div style={{
        display: 'flex', gap: '6px',
        background: 'rgba(0,0,0,0.3)', borderRadius: '14px', padding: '4px',
      }}>
        {[
          { id: 'pasteis', label: '🥟 Salgados' },
          { id: 'doces',   label: '🍫 Doces' },
          { id: 'bebidas', label: '🥤 Bebidas' },
          { id: 'avulso',  label: '+ Avulso' },
        ].map(s => (
          <button key={s.id} onClick={() => setSecao(s.id)} style={{
            flex: 1, padding: '0.6rem 0', borderRadius: '10px', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 700, border: 'none',
            background: secao === s.id ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'transparent',
            color: secao === s.id ? '#fff' : C.muted,
            transition: 'all 0.15s',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Pastéis */}
      {secao === 'pasteis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {tiposPastelAtivos.map(tipo => (
            <button key={tipo.id} onClick={() => setTipoSabores(tipo)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.875rem 1rem', borderRadius: '14px', cursor: 'pointer', textAlign: 'left',
              background: 'rgba(255,235,235,0.60)', border: `1px solid ${C.border}`,
              transition: 'all 0.12s',
            }}>
              <div>
                <div style={{ color: C.text, fontWeight: 700, fontSize: '0.9rem' }}>{tipo.nome}</div>
                <div style={{ color: C.muted, fontSize: '0.72rem', marginTop: '1px' }}>{tipo.subtitulo}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: C.gold, fontWeight: 900, fontSize: '1rem' }}>
                  {fmtMoeda(tipo.preco)}
                </span>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Plus size={18} color="#fff" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pastéis Doces */}
      {secao === 'doces' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {pasteisDocesAtivos.map(doce => {
            const qtd = qtdDoce(doce.id)
            return (
              <div key={doce.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem', borderRadius: '12px',
                background: qtd > 0 ? 'rgba(229,57,53,0.1)' : 'rgba(255,235,235,0.55)',
                border: `1px solid ${qtd > 0 ? 'rgba(229,57,53,0.35)' : C.border}`,
              }}>
                <div>
                  <div style={{ color: C.text, fontWeight: 600, fontSize: '0.88rem' }}>{doce.nome}</div>
                  <div style={{ color: C.gold, fontWeight: 700, fontSize: '0.82rem' }}>{fmtMoeda(doce.preco)}</div>
                </div>
                {qtd === 0 ? (
                  <button onClick={() => addDoce(doce)} style={{
                    width: '48px', height: '48px', borderRadius: '12px', cursor: 'pointer',
                    background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, border: 'none',
                    color: '#fff', fontSize: '1.5rem', fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>+</button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button onClick={() => remDoce(doce.id)} style={{
                      width: '48px', height: '48px', background: 'rgba(200,0,0,0.2)', border: 'none',
                      borderRadius: '11px', cursor: 'pointer', color: '#ff7777', fontSize: '1.4rem', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>−</button>
                    <span style={{ minWidth: '32px', textAlign: 'center', color: '#1A0000', fontWeight: 900, fontSize: '1.1rem' }}>{qtd}</span>
                    <button onClick={() => addDoce(doce)} style={{
                      width: '48px', height: '48px', background: 'rgba(0,200,80,0.15)', border: 'none',
                      borderRadius: '11px', cursor: 'pointer', color: '#6aff9e', fontSize: '1.4rem', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>+</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bebidas */}
      {secao === 'bebidas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {bebidasAtivas.map(beb => {
            const saboresEfetivos = bebidaSaboresMap[beb.id] ?? beb.sabores ?? []
            // Bebidas com sabores
            if (saboresEfetivos.length > 0) {
              return (
                <div key={beb.id} style={{
                  padding: '0.75rem 1rem', borderRadius: '12px',
                  background: 'rgba(255,235,235,0.55)', border: `1px solid ${C.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div>
                      <div style={{ color: C.text, fontWeight: 600, fontSize: '0.88rem' }}>{beb.nome}</div>
                      <div style={{ color: C.muted, fontSize: '0.68rem' }}>{beb.subtitulo}</div>
                    </div>
                    <span style={{ color: C.gold, fontWeight: 700, fontSize: '0.82rem' }}>{fmtMoeda(beb.preco)}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {saboresEfetivos.map(sabor => {
                      const qtd = qtdBebSabor(beb.id, sabor)
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
                              <button onClick={() => remBebidaSabor(beb.id, sabor)} style={{
                                width: '32px', height: '32px', background: 'rgba(200,0,0,0.3)', border: 'none',
                                borderRadius: '7px', cursor: 'pointer', color: '#ff7777', fontSize: '1rem', fontWeight: 900,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                              }}>−</button>
                              <span style={{ color: '#1A0000', fontWeight: 900, fontSize: '0.85rem', minWidth: '18px', textAlign: 'center' }}>{qtd}</span>
                            </>
                          )}
                          <button onClick={() => addBebidaSabor(beb, sabor)} style={{
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
            const qtd = qtdBeb(beb.id)
            return (
              <div key={beb.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem', borderRadius: '12px',
                background: qtd > 0 ? 'rgba(229,57,53,0.1)' : 'rgba(255,235,235,0.55)',
                border: `1px solid ${qtd > 0 ? 'rgba(229,57,53,0.35)' : C.border}`,
              }}>
                <div>
                  <div style={{ color: C.text, fontWeight: 600, fontSize: '0.88rem' }}>{beb.nome}</div>
                  <div style={{ color: C.muted, fontSize: '0.68rem' }}>{beb.subtitulo}</div>
                  <div style={{ color: C.gold, fontWeight: 700, fontSize: '0.82rem' }}>{fmtMoeda(beb.preco)}</div>
                </div>
                {qtd === 0 ? (
                  <button onClick={() => addBebida(beb)} style={{
                    width: '48px', height: '48px', borderRadius: '12px', cursor: 'pointer',
                    background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`, border: 'none',
                    color: '#fff', fontSize: '1.5rem', fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>+</button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button onClick={() => remBebida(beb.id)} style={{
                      width: '48px', height: '48px', background: 'rgba(200,0,0,0.2)', border: 'none',
                      borderRadius: '11px', cursor: 'pointer', color: '#ff7777', fontSize: '1.4rem', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>−</button>
                    <span style={{ minWidth: '32px', textAlign: 'center', color: '#1A0000', fontWeight: 900, fontSize: '1.1rem' }}>{qtd}</span>
                    <button onClick={() => addBebida(beb)} style={{
                      width: '48px', height: '48px', background: 'rgba(0,200,80,0.15)', border: 'none',
                      borderRadius: '11px', cursor: 'pointer', color: '#6aff9e', fontSize: '1.4rem', fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>+</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Avulso */}
      {secao === 'avulso' && (
        <div style={{
          background: 'rgba(255,235,235,0.60)', border: `1px solid ${C.border}`,
          borderRadius: '16px', padding: '1.25rem',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: '0.9rem' }}>Item Avulso</div>
          <input
            type="text"
            value={avNome}
            onChange={e => setAvNome(e.target.value)}
            placeholder="Nome do item..."
            style={{ ...inputStyle, width: '100%' }}
          />
          <input
            type="number"
            value={avPreco}
            onChange={e => setAvPreco(e.target.value)}
            placeholder="Valor (R$)"
            min="0"
            step="0.01"
            style={{ ...inputStyle, width: '100%' }}
          />
          <button
            onClick={addAvulso}
            disabled={!avNome.trim() || !(parseFloat(avPreco) > 0)}
            style={{
              padding: '0.875rem', borderRadius: '12px', cursor: 'pointer',
              fontSize: '0.95rem', fontWeight: 800, border: 'none',
              background: avNome.trim() && parseFloat(avPreco) > 0
                ? `linear-gradient(145deg, ${C.red}, ${C.redDark})`
                : 'rgba(255,235,235,0.75)',
              color: avNome.trim() && parseFloat(avPreco) > 0 ? '#fff' : C.muted,
            }}
          >
            Adicionar ao Carrinho
          </button>
          <p style={{ color: C.muted, fontSize: '0.72rem', margin: 0, fontStyle: 'italic' }}>
            Para produtos ainda não cadastrados no sistema.
          </p>
        </div>
      )}

      {/* FAB Carrinho */}
      {totalItens > 0 && (
        <button
          onClick={() => setCartAberto(true)}
          style={{
            position: 'fixed', bottom: '5.5rem', right: '1.25rem', zIndex: 200,
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '0.75rem 1.25rem', borderRadius: '50px',
            background: `linear-gradient(145deg, ${C.gold}, #d4a800)`,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 28px rgba(245,200,0,0.4)',
            color: '#1a1000', fontWeight: 900, fontSize: '0.95rem',
          }}
        >
          <ShoppingCart size={18} />
          <span>{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
          <span style={{
            background: 'rgba(26,0,0,0.2)', borderRadius: '12px',
            padding: '1px 8px', fontSize: '0.88rem',
          }}>
            {fmtMoeda(subtotal)}
          </span>
        </button>
      )}

      {/* Sheet sabores */}
      {tipoSabores && (
        <SheetSabores
          tipo={tipoSabores}
          onFechar={() => setTipoSabores(null)}
          onAdicionar={item => { addPastel(item); setTipoSabores(null) }}
        />
      )}

      {/* Sheet carrinho */}
      <SheetCarrinho
        aberto={cartAberto}
        onFechar={() => setCartAberto(false)}
        cart={cart}
        onRemover={remItem}
        subtotal={subtotal}
        onConfirmar={confirmarVenda}
        enviando={enviando}
        modo={modo}
        mesaAdicionando={mesaAdicionando}
      />
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ABA MESAS (pedidos locais abertos)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AbaMesas({ pedidos, onAtualizar, carregando, onAdicionarItens, onFecharConta }) {
  // Filter: balcao + local orders that are still open (preparando)
  const mesasAbertas = pedidos.filter(p =>
    p.origem === 'balcao' &&
    (p.observacao || '').includes('COMER NO LOCAL') &&
    p.status === 'preparando'
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UtensilsCrossed size={18} color="#4da6ff" />
          <span style={{ color: C.text, fontWeight: 800, fontSize: '1rem' }}>
            Mesas Abertas
          </span>
          <span style={{
            background: 'rgba(0,120,255,0.2)', color: '#4da6ff',
            border: '1px solid rgba(0,120,255,0.4)',
            fontSize: '0.7rem', fontWeight: 800,
            padding: '2px 8px', borderRadius: '20px',
          }}>
            {mesasAbertas.length}
          </span>
        </div>
        <button
          onClick={onAtualizar}
          style={{
            padding: '0.4rem 0.75rem', borderRadius: '20px', cursor: 'pointer',
            background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
            color: C.muted, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem',
          }}
        >
          <RefreshCw size={12} style={{ animation: carregando ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Empty state */}
      {mesasAbertas.length === 0 ? (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: '16px', padding: '2.5rem', textAlign: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          <Coffee size={32} style={{ color: C.muted, opacity: 0.4, marginBottom: '0.5rem' }} />
          <p style={{ color: C.muted, margin: 0, fontSize: '0.85rem' }}>
            Nenhuma mesa aberta
          </p>
          <p style={{ color: C.muted, margin: '0.25rem 0 0', fontSize: '0.72rem', opacity: 0.6 }}>
            Use o Balcao com "Comer no Local" para abrir contas
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mesasAbertas.map(p => {
            const itens = parseItens(p.itens)
            return (
              <div key={p.id} style={{
                background: C.card,
                border: '1px solid rgba(0,120,255,0.3)',
                borderLeft: '4px solid #4da6ff',
                borderRadius: '16px',
                overflow: 'hidden',
                backdropFilter: 'blur(12px)',
              }}>
                {/* Header */}
                <div style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(0,120,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UtensilsCrossed size={14} color="#4da6ff" />
                    <span style={{
                      color: C.text, fontFamily: 'Bebas Neue, sans-serif',
                      fontSize: '1.1rem', letterSpacing: '2px',
                    }}>
                      #{p.numero}
                    </span>
                    <span style={{
                      background: 'rgba(0,120,255,0.2)', color: '#4da6ff',
                      border: '1px solid rgba(0,120,255,0.4)',
                      fontSize: '0.62rem', fontWeight: 700,
                      padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase',
                    }}>
                      Aberto
                    </span>
                  </div>
                  <span style={{ color: C.gold, fontWeight: 800, fontSize: '1rem', fontFamily: 'Bebas Neue, sans-serif' }}>
                    {fmtMoeda(p.total)}
                  </span>
                </div>

                {/* Client + items */}
                <div style={{ padding: '0.625rem 1rem' }}>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px' }}>
                    {p.nome}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {itens.map((it, i) => (
                      <div key={i} style={{ color: C.muted, fontSize: '0.75rem', lineHeight: 1.4 }}>
                        {it.qtd || 1}x {it.nome}
                        {it.sabores?.length > 0 && ` (${it.sabores.join(', ')})`}
                        <span style={{ color: C.gold, marginLeft: '6px', fontSize: '0.7rem' }}>
                          {fmtMoeda((it.preco || 0) * (it.qtd || 1))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ color: C.muted, fontSize: '0.7rem', marginTop: '4px' }}>
                    {fmtHora(p.created_at)} · {p.pagamento?.toUpperCase()}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ padding: '0.5rem 1rem 0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => onAdicionarItens(p)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '0.7rem', borderRadius: '10px', cursor: 'pointer',
                      background: 'rgba(0,120,255,0.15)', border: '1px solid rgba(0,120,255,0.35)',
                      color: '#4da6ff', fontSize: '0.82rem', fontWeight: 700,
                    }}
                  >
                    <Plus size={14} /> Adicionar itens
                  </button>
                  <button
                    onClick={() => onFecharConta(p)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '0.7rem', borderRadius: '10px', cursor: 'pointer',
                      background: `linear-gradient(145deg, ${C.success}, #009940)`,
                      border: 'none', color: '#fff',
                      fontSize: '0.82rem', fontWeight: 800,
                      boxShadow: `0 4px 14px rgba(0,200,80,0.3)`,
                    }}
                  >
                    <Check size={14} /> Fechar conta
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHEET FECHAR CONTA (para mesas abertas)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SheetFecharConta({ pedido, onFechar, onConfirmar, enviando, senhaAdmin }) {
  const [pagamento, setPagamento] = useState(pedido?.pagamento || 'dinheiro')
  const [valorRecebido, setValorRecebido] = useState('')
  const [descontoTipo, setDescontoTipo] = useState('nenhum')
  const [descontoValor, setDescontoValor] = useState('')
  const [descontoObs, setDescontoObs] = useState('')
  const [senhaDesconto, setSenhaDesconto] = useState('')
  const [descontoAutorizado, setDescontoAutorizado] = useState(false)
  const [erroSenha, setErroSenha] = useState('')

  function resetDesconto() {
    setDescontoTipo('nenhum'); setDescontoValor(''); setDescontoObs('')
    setSenhaDesconto(''); setDescontoAutorizado(false); setErroSenha('')
  }

  function validarSenhaDesconto() {
    const senhaCorreta = senhaAdmin || '1234'
    if (senhaDesconto === senhaCorreta) {
      setDescontoAutorizado(true); setErroSenha('')
    } else {
      setErroSenha('Senha incorreta'); setTimeout(() => setErroSenha(''), 2500)
    }
  }

  if (!pedido) return null

  const total = Number(pedido.total || 0)
  const itens = parseItens(pedido.itens)

  const descontoCalculado = (() => {
    if (!descontoAutorizado) return 0
    if (descontoTipo === 'valor') {
      const v = parseFloat(String(descontoValor).replace(',', '.')) || 0
      return Math.min(v, total)
    }
    if (descontoTipo === 'porcentagem') {
      const pct = parseFloat(String(descontoValor).replace(',', '.')) || 0
      return Math.round(total * Math.min(pct, 100) / 100 * 100) / 100
    }
    return 0
  })()
  const totalComDesconto = Math.max(0, Math.round((total - descontoCalculado) * 100) / 100)
  const descontoPct = descontoTipo === 'porcentagem' ? (parseFloat(String(descontoValor).replace(',', '.')) || 0) : null

  const valorRec = parseFloat(String(valorRecebido).replace(',', '.')) || 0
  const troco = pagamento === 'dinheiro' && valorRec > totalComDesconto ? Math.round((valorRec - totalComDesconto) * 100) / 100 : 0
  const trocoNeg = pagamento === 'dinheiro' && valorRec > 0 && valorRec < totalComDesconto

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onFechar}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '92vh', overflowY: 'auto',
          background: 'rgba(255,240,240,0.97)',
          borderRadius: '24px 24px 0 0',
          border: `1px solid ${C.border}`,
          padding: '0.75rem 1.25rem 2.5rem',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Handle */}
        <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', margin: '0 auto 1rem' }} />

        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={18} color={C.success} />
            <span style={{ color: C.text, fontWeight: 800, fontSize: '1rem' }}>Fechar Conta #{pedido.numero}</span>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
            <X size={22} />
          </button>
        </div>

        {/* Client */}
        <div style={{
          padding: '0.625rem 0.875rem', borderRadius: '10px',
          background: 'rgba(0,120,255,0.08)', border: '1px solid rgba(0,120,255,0.2)',
          marginBottom: '1rem',
        }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: '0.85rem' }}>{pedido.nome}</div>
          <div style={{ color: C.muted, fontSize: '0.72rem', marginTop: '2px' }}>
            {itens.map((it, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {it.qtd || 1}x {it.nome}
              </span>
            ))}
          </div>
        </div>

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.625rem 0', borderTop: `1px solid ${C.border}`, marginBottom: '1rem',
        }}>
          <span style={{ color: C.muted, fontWeight: 600 }}>Total</span>
          <span style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.6rem', letterSpacing: '1px' }}>
            {fmtMoeda(total)}
          </span>
        </div>

        {/* Desconto / Cortesia */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
            Desconto / Cortesia
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: descontoTipo !== 'nenhum' ? '8px' : '0' }}>
            {[['nenhum','Nenhum'],['valor','R$ Fixo'],['porcentagem','% Off']].map(([t, label]) => (
              <button key={t} onClick={() => resetDesconto() || setDescontoTipo(t)} style={{
                padding: '0.5rem 0', borderRadius: '10px', cursor: 'pointer',
                fontSize: '0.72rem', fontWeight: 700, border: 'none',
                background: descontoTipo === t ? 'linear-gradient(145deg,#1a6b1a,#0d4a0d)' : 'rgba(255,235,235,0.70)',
                color: descontoTipo === t ? '#fff' : C.muted,
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* Senha do admin para autorizar */}
          {descontoTipo !== 'nenhum' && !descontoAutorizado && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="password" value={senhaDesconto} onChange={e => setSenhaDesconto(e.target.value)}
                  placeholder="Senha do administrador"
                  onKeyDown={e => e.key === 'Enter' && validarSenhaDesconto()}
                  style={{ flex: 1, padding: '0.625rem 0.875rem', borderRadius: '10px', fontSize: '0.85rem',
                    background: 'rgba(255,235,235,0.70)', border: `1px solid ${erroSenha ? 'rgba(255,82,82,0.5)' : C.border}`,
                    color: C.text, outline: 'none', boxSizing: 'border-box' }} />
                <button onClick={validarSenhaDesconto} style={{
                  padding: '0 1rem', borderRadius: '10px', cursor: 'pointer',
                  background: 'linear-gradient(145deg,#1a6b1a,#0d4a0d)', border: 'none',
                  color: '#fff', fontWeight: 700, fontSize: '0.82rem',
                }}>OK</button>
              </div>
              {erroSenha && <p style={{ color: '#FF5252', fontSize: '0.72rem', margin: '4px 0 0', fontWeight: 700 }}>{erroSenha}</p>}
            </div>
          )}

          {/* Campos de desconto — so apos senha */}
          {descontoTipo !== 'nenhum' && descontoAutorizado && (<>
            {descontoTipo === 'valor' && (
              <input type="number" value={descontoValor} onChange={e => setDescontoValor(e.target.value)}
                placeholder="Valor a descontar (R$)" min="0" step="0.01"
                style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '10px', fontSize: '0.85rem',
                  background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
                  color: C.text, outline: 'none', boxSizing: 'border-box', marginBottom: '6px' }} />
            )}
            {descontoTipo === 'porcentagem' && (
              <input type="number" value={descontoValor} onChange={e => setDescontoValor(e.target.value)}
                placeholder="Porcentagem (%)" min="0" max="100" step="1"
                style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '10px', fontSize: '0.85rem',
                  background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
                  color: C.text, outline: 'none', boxSizing: 'border-box', marginBottom: '6px' }} />
            )}
            <input type="text" value={descontoObs} onChange={e => setDescontoObs(e.target.value)}
              placeholder="Motivo do desconto (obrigatorio)"
              style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '10px', fontSize: '0.82rem',
                background: 'rgba(255,235,235,0.70)', border: `1px solid rgba(0,200,0,0.3)`,
                color: C.text, outline: 'none', boxSizing: 'border-box' }} />
          </>)}
        </div>

        {/* Resumo do desconto */}
        {descontoCalculado > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.5rem 0.875rem', borderRadius: '10px', marginBottom: '0.75rem',
            background: 'rgba(0,180,0,0.1)', border: '1px solid rgba(0,200,0,0.25)',
          }}>
            <span style={{ color: '#4ade80', fontSize: '0.82rem', fontWeight: 700 }}>
              {descontoTipo === 'porcentagem' ? `${descontoValor}% de desconto` : 'Desconto aplicado'}
            </span>
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: '0.9rem' }}>
              - {fmtMoeda(descontoCalculado)}
            </span>
          </div>
        )}

        {/* Payment */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
            Pagamento
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px' }}>
            {['dinheiro', 'pix', 'debito', 'credito'].map(p => (
              <button key={p} onClick={() => { setPagamento(p); setValorRecebido('') }} style={{
                padding: '0.6rem 0', borderRadius: '10px', cursor: 'pointer',
                fontSize: '0.72rem', fontWeight: 700, border: 'none',
                background: pagamento === p ? `linear-gradient(145deg, ${C.red}, ${C.redDark})` : 'rgba(255,235,235,0.70)',
                color: pagamento === p ? '#fff' : C.muted, textTransform: 'capitalize',
              }}>
                {p === 'dinheiro' ? 'Dinheiro' : p === 'debito' ? 'Debito' : p === 'credito' ? 'Credito' : 'PIX'}
              </button>
            ))}
          </div>
        </div>

        {/* Change */}
        {pagamento === 'dinheiro' && (
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ display: 'block', color: C.muted, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
              Valor recebido (R$)
            </label>
            <input
              type="number"
              value={valorRecebido}
              onChange={e => setValorRecebido(e.target.value)}
              placeholder="0,00"
              min="0"
              step="0.01"
              style={{
                width: '100%', padding: '0.7rem 0.875rem', borderRadius: '12px', fontSize: '0.88rem',
                background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
                color: C.text, outline: 'none', boxSizing: 'border-box',
              }}
            />
            {valorRec > 0 && (
              <div style={{
                marginTop: '8px', padding: '0.625rem 0.875rem', borderRadius: '10px',
                background: trocoNeg ? 'rgba(200,0,0,0.15)' : 'rgba(0,200,80,0.12)',
                border: `1px solid ${trocoNeg ? 'rgba(200,0,0,0.35)' : 'rgba(0,200,80,0.3)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: trocoNeg ? '#ff7777' : C.muted, fontSize: '0.82rem', fontWeight: 600 }}>
                  {trocoNeg ? 'Valor insuficiente' : 'Troco'}
                </span>
                {!trocoNeg && (
                  <span style={{ color: C.success, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.4rem' }}>
                    {fmtMoeda(troco)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Confirm */}
        <button
          onClick={() => onConfirmar({
            pedidoId: pedido.id, pagamento,
            troco: troco > 0 ? troco : null,
            desconto: descontoCalculado > 0 ? { tipo: descontoTipo, valor: descontoCalculado, pct: descontoPct, obs: descontoObs } : null,
          })}
          disabled={enviando || trocoNeg || (descontoCalculado > 0 && !descontoObs.trim())}
          style={{
            width: '100%', padding: '1rem', borderRadius: '14px',
            cursor: enviando || trocoNeg ? 'not-allowed' : 'pointer',
            fontSize: '1rem', fontWeight: 800, border: 'none',
            background: trocoNeg || enviando
              ? 'rgba(255,235,235,0.75)'
              : `linear-gradient(145deg, ${C.success}, #009940)`,
            color: trocoNeg || enviando ? C.muted : '#fff',
            boxShadow: !trocoNeg && !enviando ? '0 6px 20px rgba(0,200,80,0.3)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          {enviando
            ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Fechando...</>
            : <><Check size={16} /> Fechar conta — {fmtMoeda(totalComDesconto)}</>
          }
        </button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CAIXA — COMPONENTE PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function Caixa() {
  const [logado, setLogado] = useState(false)
  const [senha, setSenha] = useState('')
  const [errLogin, setErrLogin] = useState('')
  const [aba, setAba] = useState('pedidos')
  const [modo, setModo] = useState('levar')

  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [toast, setToast] = useState(null)

  // Mesas (fechar conta + adicionar itens)
  const [contaSheet, setContaSheet] = useState(null)
  const [fechandoConta, setFechandoConta] = useState(false)
  const [mesaAdicionando, setMesaAdicionando] = useState(null) // pedido da mesa para adicionar itens

  const pedidosRef = useRef([])
  const [clientesCaderneta, setClientesCaderneta] = useState([])

  useEffect(() => {
    if (!logado) return
    fetch('/api/clientes').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setClientesCaderneta(data)
    }).catch(() => {})
  }, [logado])

  const carregarPedidos = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const hoje = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/pedido?data=${hoje}`)
      if (res.ok) {
        const lista = await res.json()
        if (Array.isArray(lista)) {
          if (pedidosRef.current.length > 0 && lista.length > pedidosRef.current.length) {
            const novos = lista.filter(p => !pedidosRef.current.find(a => a.id === p.id))
            novos.forEach(novo => {
              if (novo.origem !== 'balcao') {
                tocarBeep()
                setToast(`Novo pedido! #${novo.numero} — ${novo.nome}`)
                setTimeout(() => setToast(null), 5000)
              }
            })
          }
          pedidosRef.current = lista
          setPedidos(lista)
        }
      }
    } catch (_) {}
    if (!silencioso) setCarregando(false)
  }, [])

  useEffect(() => {
    if (!logado) return
    carregarPedidos()
    const iv = setInterval(() => carregarPedidos(true), 10000)
    return () => clearInterval(iv)
  }, [logado, carregarPedidos])

  async function atualizarStatus(id, novoStatus) {
    try {
      await fetch('/api/pedido', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: novoStatus }),
      })
      carregarPedidos(true)
    } catch (_) {}
  }

  async function fecharConta({ pedidoId, pagamento, troco, desconto }) {
    setFechandoConta(true)
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
        const descontoInfo = `\uD83C\uDF81 DESCONTO: R$ ${descontoValorReal.toFixed(2).replace('.', ',')}${desconto.obs ? ` — ${desconto.obs}` : ''}`
        patchBody.observacao = obsAtual ? `${obsAtual}\n${descontoInfo}` : descontoInfo
        patchBody.desconto_tipo = desconto.tipo
        patchBody.desconto_valor = descontoValorReal
        patchBody.desconto_pct = desconto.pct || null
        patchBody.desconto_obs = desconto.obs || ''
      }
      await fetch('/api/pedido', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      setContaSheet(null)
      setToast('Conta fechada com sucesso!')
      setTimeout(() => setToast(null), 4000)
      carregarPedidos(true)
    } catch (_) {}
    setFechandoConta(false)
  }

  function adicionarItensMesa(pedido) {
    setMesaAdicionando(pedido)
    setModo('local')
    setAba('balcao')
    setToast(`Adicione itens para ${pedido.nome} (#${pedido.numero})`)
    setTimeout(() => setToast(null), 5000)
  }

  function login() {
    if (senha === CONFIG.senhaAdmin) { setLogado(true); setErrLogin('') }
    else setErrLogin('Senha incorreta.')
  }

  // Todos os pedidos ativos (site + balcao) para aba Pedidos
  // Mesas abertas ficam na aba Mesas, os demais na aba Pedidos
  const mesasAbertas = pedidos.filter(p =>
    p.origem === 'balcao' &&
    (p.observacao || '').includes('COMER NO LOCAL') &&
    p.status === 'preparando'
  )
  const mesasIds = new Set(mesasAbertas.map(p => p.id))
  const pedidosTodos = pedidos.filter(p => !mesasIds.has(p.id))
  const pendentes = pedidosTodos.filter(p => ['recebido', 'preparando'].includes(p.status)).length

  // ── Login ───────────────────────────────────────────────────────
  if (!logado) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}>
        <div style={{
          width: '100%', maxWidth: '340px',
          background: 'rgba(255,235,235,0.70)', border: `1px solid ${C.border}`,
          borderRadius: '24px', padding: '2rem',
          backdropFilter: 'blur(20px)', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <img src="/logo-carioca.png" alt="Pastel do Carioca"
            style={{ height: '72px', width: 'auto', objectFit: 'contain', marginBottom: '1rem', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.7))' }} />
          <h1 style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', letterSpacing: '3px', margin: '0 0 0.25rem' }}>
            Caixa Mobile
          </h1>
          <p style={{ color: C.muted, fontSize: '0.8rem', margin: '0 0 1.5rem' }}>{CONFIG.nomeLoja}</p>
          <input
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="Senha de acesso"
            style={{
              width: '100%', padding: '0.875rem 1rem', borderRadius: '14px', fontSize: '1rem',
              background: 'rgba(255,235,235,0.70)', border: `1px solid ${errLogin ? C.danger : C.border}`,
              color: C.text, outline: 'none', marginBottom: '0.75rem', boxSizing: 'border-box',
            }}
          />
          {errLogin && <p style={{ color: '#FF7777', fontSize: '0.8rem', margin: '0 0 0.75rem', fontWeight: 700 }}>{errLogin}</p>}
          <button onClick={login} style={{
            width: '100%', padding: '1rem', borderRadius: '14px', cursor: 'pointer',
            background: `linear-gradient(145deg, ${C.red}, ${C.redDark})`,
            border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 800,
            boxShadow: '0 6px 20px rgba(229,57,53,0.4)',
          }}>
            Entrar
          </button>
        </div>
      </div>
    )
  }

  // ── App ─────────────────────────────────────────────────────────
  return (
    <div id="caixa-root-wrapper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, rgba(255,220,220,0.98) 0%, rgba(255,235,235,0.99) 50%, rgba(255,225,225,0.98) 100%)' }}>
      <style>{`
        html { font-size: clamp(17px, 1.5vw, 20px) !important; }

        #caixa-root-wrapper, #caixa-root-wrapper * {
          font-weight: 900 !important;
        }

        #caixa-root-wrapper span,
        #caixa-root-wrapper p,
        #caixa-root-wrapper h1, #caixa-root-wrapper h2, #caixa-root-wrapper h3,
        #caixa-root-wrapper h4, #caixa-root-wrapper h5, #caixa-root-wrapper h6,
        #caixa-root-wrapper td, #caixa-root-wrapper th,
        #caixa-root-wrapper label,
        #caixa-root-wrapper li {
          text-shadow:
            0.4px  0px   0px rgba(15,0,0,0.35),
           -0.4px  0px   0px rgba(15,0,0,0.35),
            0px    0.4px 0px rgba(15,0,0,0.35),
            0px   -0.4px 0px rgba(15,0,0,0.35);
        }

        #caixa-root-wrapper button span {
          text-shadow:
            0.3px  0px   0px rgba(255,255,255,0.2),
           -0.3px  0px   0px rgba(255,255,255,0.2),
            0px    0.3px 0px rgba(255,255,255,0.2),
            0px   -0.3px 0px rgba(255,255,255,0.2);
        }

        #caixa-root-wrapper {
          min-height: 100vh;
        }

        #caixa-root-wrapper ::-webkit-scrollbar { width: 5px; height: 5px; }
        #caixa-root-wrapper ::-webkit-scrollbar-track { background: rgba(255,220,220,0.3); border-radius: 4px; }
        #caixa-root-wrapper ::-webkit-scrollbar-thumb { background: rgba(160,0,0,0.35); border-radius: 4px; }
        #caixa-root-wrapper ::-webkit-scrollbar-thumb:hover { background: rgba(160,0,0,0.55); }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(145deg, #3d0000, #6b0000)',
          border: `1px solid ${C.gold}`, color: C.gold,
          fontWeight: 800, fontSize: '0.88rem',
          padding: '0.75rem 1.25rem', borderRadius: '14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 500, whiteSpace: 'nowrap',
          backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: '6px',
          maxWidth: 'calc(100vw - 2rem)',
        }}>
          <Bell size={14} /> {toast}
        </div>
      )}

      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,240,240,0.95)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.border}`,
        padding: '0.75rem 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo-carioca.png" alt="" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
          <div>
            <div style={{ color: C.gold, fontFamily: 'Bebas Neue, sans-serif', fontSize: '0.95rem', letterSpacing: '1px', lineHeight: 1 }}>
              Caixa Mobile
            </div>
            <div style={{ color: C.muted, fontSize: '0.62rem' }}>{CONFIG.nomeLoja}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {pendentes > 0 && (
            <div style={{
              background: C.red, color: '#fff', borderRadius: '999px',
              fontSize: '0.7rem', fontWeight: 900, padding: '2px 8px',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <Bell size={11} /> {pendentes} pendente{pendentes > 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={() => { setLogado(false); setSenha('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Conteudo */}
      <main style={{ flex: 1, padding: '1rem 1rem 1.5rem', overflowX: 'hidden' }}>
        {aba === 'pedidos' && (
          <AbaPedidos
            pedidos={pedidosTodos}
            onStatus={atualizarStatus}
            onAtualizar={() => carregarPedidos()}
            carregando={carregando}
            onFinalizar={p => setContaSheet(p)}
          />
        )}
        {aba === 'balcao' && (
          <AbaBalcao
            onPedidoCriado={() => { setMesaAdicionando(null); carregarPedidos(true) }}
            modo={modo}
            setModo={setModo}
            mesaAdicionando={mesaAdicionando}
            onCancelarMesa={() => { setMesaAdicionando(null); setAba('mesas') }}
          />
        )}
        {aba === 'mesas' && (
          <AbaMesas
            pedidos={pedidos}
            onAtualizar={() => carregarPedidos()}
            carregando={carregando}
            onAdicionarItens={adicionarItensMesa}
            onFecharConta={p => setContaSheet(p)}
          />
        )}
      </main>

      {/* Sheet fechar conta */}
      {contaSheet && (
        <SheetFecharConta
          pedido={contaSheet}
          onFechar={() => setContaSheet(null)}
          onConfirmar={fecharConta}
          enviando={fechandoConta}
          senhaAdmin={cardapioState?.senha_desconto}
        />
      )}

      {/* Bottom navigation */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,240,240,0.97)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderTop: `1px solid ${C.border}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {[
          { id: 'pedidos', label: 'Pedidos', icon: ClipboardList, badge: pendentes },
          { id: 'balcao',  label: 'Balcao',  icon: Store, badge: 0 },
          { id: 'mesas',   label: 'Mesas',   icon: UtensilsCrossed, badge: mesasAbertas.length },
        ].map(item => {
          const ativo = aba === item.id
          return (
            <button
              key={item.id}
              onClick={() => setAba(item.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '3px', padding: '0.75rem 0.5rem',
                background: 'none', border: 'none', cursor: 'pointer',
                color: ativo ? C.red : C.muted,
                position: 'relative',
                borderTop: ativo ? `2px solid ${C.red}` : '2px solid transparent',
              }}
            >
              <item.icon size={22} color={ativo ? C.red : 'rgba(15,0,0,0.82)'} />
              <span style={{ fontSize: '0.7rem', fontWeight: ativo ? 800 : 500 }}>{item.label}</span>
              {item.badge > 0 && (
                <span style={{
                  position: 'absolute', top: '8px', right: 'calc(50% - 18px)',
                  background: item.id === 'mesas' ? '#0066cc' : C.red,
                  color: '#fff', borderRadius: '999px',
                  fontSize: '0.6rem', fontWeight: 900, padding: '1px 5px', lineHeight: 1.4,
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
