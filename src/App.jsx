import { useState, useEffect, useRef } from 'react'
import { TIPOS_PASTEL, PASTEIS_DOCES, categorias } from './data/cardapio.js'
import { useCarrinho } from './hooks/useCarrinho.js'
import { CONFIG } from './config.js'
import { buscarConfiguracaoLoja } from './utils/salvarPedido.js'
import BannerEspecial from './components/BannerEspecial.jsx'
import CardPastel from './components/CardPastel.jsx'
import ModalSabores from './components/ModalSabores.jsx'
import CarrinhoSidebar from './components/CarrinhoSidebar.jsx'
import TelaCarrinho from './components/TelaCarrinho.jsx'
import TelaUpsell from './components/TelaUpsell.jsx'
import ModalPedido from './components/ModalPedido.jsx'

const SECOES = [
  { id: 'pasteis',  label: 'Pastéis',       emoji: '🥟' },
  { id: 'doces',    label: 'Pastéis Doces', emoji: '🍫' },
  { id: 'bebidas',  label: 'Bebidas',       emoji: '🥤' },
  { id: 'diversos', label: 'Diversos',      emoji: '📦' },
]

function ComboTimer({ horarioFechamento }) {
  const [tempo, setTempo] = useState('')
  useEffect(() => {
    function calc() {
      const agora = new Date()
      const [h, m] = (horarioFechamento || '22:00').split(':').map(Number)
      const fim = new Date()
      fim.setHours(h, m, 0, 0)
      const diff = fim - agora
      if (diff <= 0) { setTempo(''); return }
      const hh = Math.floor(diff / 3600000)
      const mm = Math.floor((diff % 3600000) / 60000)
      const ss = Math.floor((diff % 60000) / 1000)
      setTempo(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`)
    }
    calc()
    const iv = setInterval(calc, 1000)
    return () => clearInterval(iv)
  }, [horarioFechamento])

  if (!tempo) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      background: 'rgba(0,0,0,0.4)', padding: '3px 10px', borderRadius: '12px', marginLeft: 'auto',
    }}>
      <span style={{ color: '#F5C800', fontSize: '0.68rem', fontWeight: 600 }}>⏱ Encerra em</span>
      <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.78rem', fontFamily: 'monospace', letterSpacing: '1px' }}>{tempo}</span>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState('cardapio') // 'cardapio' | 'doces' | 'bebidas' | 'diversos' | 'carrinho' | 'upsell'
  const [catalogoItens, setCatalogoItens] = useState([])
  const [bebidaSaboresMap, setBebidaSaboresMap] = useState({}) // { bebida_id: ['Sabor1', ...] }
  const [secaoAtiva, setSecaoAtiva] = useState('pasteis')
  const [modalAberto, setModalAberto] = useState(false)
  const [tipoSelecionado, setTipoSelecionado] = useState(null)
  const [lojaAberta, setLojaAberta] = useState(true)
  const [cardapioState, setCardapioState] = useState(null)
  const [saborSeletor, setSaborSeletor] = useState(null) // id do item com seletor aberto
  const [qtdPopup, setQtdPopup] = useState(null) // { type: 'bebida'|'doce', item, sabor? }
  const [showMaioPopup, setShowMaioPopup] = useState(false)
  const tabsRef = useRef(null)
  const secaoPasteisRef = useRef(null)
  const secaoBebidasRef = useRef(null)
  const scrollAreaRef = useRef(null)

  const { itens, adicionar, remover, limpar, totalItens, subtotal, qtdPorTipo } = useCarrinho()

  useEffect(() => {
    fetch('/api/catalogo').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setCatalogoItens(data)
    }).catch(() => {})
    fetch('/api/bebidas-sabores').then(r => r.json()).then(rows => {
      if (!Array.isArray(rows)) return
      const map = {}
      rows.forEach(r => { map[r.bebida_id] = r.sabores })
      setBebidaSaboresMap(map)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    buscarConfiguracaoLoja().then(cfg => {
      if (!cfg) return
      setCardapioState(cfg)
      if (cfg.status === 'fechada') {
        setLojaAberta(false)
      } else if (cfg.status === 'auto') {
        const agora = new Date()
        const hora = agora.getHours() * 60 + agora.getMinutes()
        const [hA, mA] = (cfg.horario_abertura || CONFIG.horarioAbertura).split(':').map(Number)
        const [hF, mF] = (cfg.horario_fechamento || CONFIG.horarioFechamento).split(':').map(Number)
        const dentroHorario = hora >= hA * 60 + mA && hora < hF * 60 + mF
        // Check dias_funcionamento (array of day numbers 0=Sun..6=Sat)
        const diasFunc = cfg.dias_funcionamento
        const diaAberto = !diasFunc || diasFunc.length === 0 || diasFunc.includes(agora.getDay())
        setLojaAberta(dentroHorario && diaAberto)
      } else {
        setLojaAberta(true)
      }
    }).catch(() => {})
  }, [])

  function scrollParaSecao(id) {
    setSecaoAtiva(id)
    if (id === 'bebidas') setView('bebidas')
    else if (id === 'doces') setView('doces')
    else if (id === 'diversos') setView('diversos')
    else setView('cardapio')
  }

  function handlePersonalizar(tipo) {
    setTipoSelecionado(tipo)
  }

  function handleAdicionarPastel(itemData) {
    adicionar(itemData)
    setTipoSelecionado(null)
    setShowMaioPopup(true)
  }

  function handleAdicionarBebida(bebida, sabor) {
    const chave = sabor ? `beb-${bebida.id}-${sabor}` : `beb-${bebida.id}`
    const nome = sabor ? `${bebida.nome} ${sabor}` : bebida.nome
    adicionar({ chave, tipoId: 'bebida', nome, preco: bebida.preco })
  }

  function handleRemoverBebida(chave) {
    remover(chave)
  }

  function qtdBebidaNoCarrinho(bebidaId) {
    // soma todas as variações (sabores) do item
    return itens
      .filter(i => i.chave === `beb-${bebidaId}` || i.chave.startsWith(`beb-${bebidaId}-`))
      .reduce((acc, i) => acc + i.qtd, 0)
  }

  function qtdSaborNoCarrinho(bebidaId, sabor) {
    const chave = `beb-${bebidaId}-${sabor}`
    const item = itens.find(i => i.chave === chave)
    return item ? item.qtd : 0
  }

  function handleAdicionarDoce(doce) {
    const preco = cardapioState?.precos?.[doce.id] ?? doce.preco
    adicionar({
      chave: doce.id,
      tipoId: 'doce',
      nome: `Pastel ${doce.nome}`,
      sabores: [doce.nome],
      adicionais: [],
      observacao: '',
      preco,
    })
  }

  function qtdDoceNoCarrinho(doceId) {
    const item = itens.find(i => i.chave === doceId)
    return item ? item.qtd : 0
  }

  const especialAtivo = cardapioState?.especial_ativo === true
  const especial = {
    nome: cardapioState?.especial_nome || CONFIG.especialNome,
    descricao: cardapioState?.especial_descricao || CONFIG.especialDescricao,
    preco: cardapioState?.especial_preco ?? CONFIG.especialPreco,
  }

  const combosAtivos = (cardapioState?.combos || []).filter(c => c.ativo)

  function handleAdicionarCombo(combo) {
    adicionar({
      chave: `combo-${combo.id}`,
      tipoId: 'combo',
      nome: combo.nome,
      sabores: [],
      adicionais: [],
      observacao: combo.descricao || '',
      preco: Number(combo.preco),
    })
  }

  return (
    <div className="app-shell">

      {/* ── WATERMARK ── */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        <img src="/logo-carioca.png" alt="" style={{
          width: 'min(110vw, 110vh)', height: 'auto', objectFit: 'contain',
          opacity: 0.10,
          filter: 'blur(0.5px) drop-shadow(0 0 80px #CC0000) drop-shadow(0 0 160px #8B0000) drop-shadow(0 0 40px #FF4444) saturate(0.3) brightness(2.5)',
          transform: 'scale(1.15)',
        }} />
      </div>

      {/* ── CONTEÚDO ── */}
      <div className="app-inner">

        {/* ════════ HEADER + TABS (views cardapio e bebidas) ════════ */}
        {(view === 'cardapio' || view === 'doces' || view === 'bebidas' || view === 'diversos') && (
          <>
            <header className="app-header" style={{
              background: 'linear-gradient(160deg, rgba(0,0,0,0.72), rgba(26,0,0,0.62))',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              padding: '0.6rem 1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '0.75rem', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <img src="/logo-carioca.png" alt="Pastel do Carioca" className="header-logo" style={{
                  height: '44px', width: 'auto', objectFit: 'contain',
                  filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))', flexShrink: 0,
                }} />
                <div>
                  <div className="header-brand-name" style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem', letterSpacing: '1px', lineHeight: 1 }}>
                    Pastel do Carioca
                  </div>
                  <div className="header-slogan" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.67rem' }}>
                    {CONFIG.slogan}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: lojaAberta ? 'rgba(0,180,80,0.2)' : 'rgba(180,0,0,0.25)',
                  border: `1px solid ${lojaAberta ? 'rgba(0,200,80,0.4)' : 'rgba(200,0,0,0.4)'}`,
                  borderRadius: '20px', padding: '3px 9px',
                  fontSize: '0.7rem', fontWeight: 700,
                  color: lojaAberta ? '#6aff9e' : '#ff7777',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                  {lojaAberta ? 'Aberta' : 'Fechada'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.62rem' }}>
                  {cardapioState?.horario_abertura || CONFIG.horarioAbertura}–{cardapioState?.horario_fechamento || CONFIG.horarioFechamento} · {CONFIG.tempoRetirada}
                </div>
              </div>
            </header>

            {especialAtivo && <BannerEspecial especial={especial} onAdicionar={adicionar} />}

            {/* ── COMBOS / PROMOÇÕES ── */}
            {combosAtivos.length > 0 && (
              <div style={{
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                padding: '0.75rem 1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#F5C800', fontWeight: 900, fontSize: '0.85rem' }}>🎉 Promoções</span>
                  <ComboTimer horarioFechamento={cardapioState?.horario_fechamento || CONFIG.horarioFechamento} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {combosAtivos.map(combo => {
                    const qtd = itens.filter(i => i.chave === `combo-${combo.id}`).reduce((s, i) => s + i.qtd, 0)
                    return (
                      <div key={combo.id} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        background: 'rgba(200,0,0,0.1)', border: '1px solid rgba(200,0,0,0.3)',
                        borderRadius: '14px', padding: '0.7rem 0.875rem',
                      }}>
                        <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>🎉</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.88rem', margin: 0, lineHeight: 1.2 }}>{combo.nome}</p>
                          {combo.descricao && (
                            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{combo.descricao}</p>
                          )}
                        </div>
                        <span style={{ color: '#00c853', fontWeight: 900, fontSize: '0.92rem', flexShrink: 0, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.5px' }}>
                          R$ {Number(combo.preco).toFixed(2).replace('.', ',')}
                        </span>
                        {qtd === 0 ? (
                          <button
                            onClick={() => handleAdicionarCombo(combo)}
                            style={{
                              width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                              background: 'linear-gradient(145deg, #E00000, #A00000)',
                              border: '1.5px solid rgba(255,255,255,0.1)',
                              color: '#fff', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >+</button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(10,0,0,0.8)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }}>
                            <button onClick={() => remover(`combo-${combo.id}`)} style={{ width: '28px', height: '28px', background: 'none', border: 'none', color: '#FF7777', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                            <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.82rem', minWidth: '18px', textAlign: 'center' }}>{qtd}</span>
                            <button onClick={() => handleAdicionarCombo(combo)} style={{ width: '28px', height: '28px', background: 'none', border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div ref={tabsRef} style={{
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', minWidth: 'max-content', padding: '0 0.75rem' }}>
                {SECOES.map(sec => {
                  const ativa = (sec.id === 'pasteis' && view === 'cardapio') || (sec.id === 'doces' && view === 'doces') || (sec.id === 'bebidas' && view === 'bebidas') || (sec.id === 'diversos' && view === 'diversos')
                  return (
                    <button
                      key={sec.id}
                      onClick={() => scrollParaSecao(sec.id)}
                      className={ativa ? 'tab-carioca-active' : 'tab-carioca-inactive'}
                      style={{
                        padding: '0.6rem 1.1rem', border: 'none', background: 'none',
                        cursor: 'pointer', fontSize: '0.875rem',
                        fontFamily: 'Nunito, sans-serif', fontWeight: ativa ? 800 : 600,
                        transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        touchAction: 'manipulation',
                      }}
                    >
                      <span>{sec.emoji}</span>
                      <span>{sec.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ════════ VIEW: PASTÉIS ════════ */}
        {view === 'cardapio' && (
          <div className="app-body">
            <main ref={scrollAreaRef} className="app-scroll">
              <div style={{ padding: '0.75rem 1rem 0.25rem', color: 'rgba(255,255,255,0.38)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Pastéis
              </div>
              <div className="pasteis-grid">
                {TIPOS_PASTEL.map(tipo => (
                  <CardPastel
                    key={tipo.id}
                    tipo={tipo}
                    onPersonalizar={handlePersonalizar}
                    qtdNoCarrinho={qtdPorTipo(tipo.id)}
                  />
                ))}
              </div>
              <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
                <a href="/acompanhar" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textDecoration: 'none' }}>
                  📍 Acompanhar pedido
                </a>
                <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.62rem', marginTop: '4px' }}>{CONFIG.cidade}</div>
                <a href="/admin" style={{ color: 'rgba(255,255,255,0.12)', fontSize: '0.6rem', textDecoration: 'none', display: 'block', marginTop: '4px' }}>admin</a>
              </div>
            </main>
            <div className="sidebar-desktop">
              <CarrinhoSidebar itens={itens} subtotal={subtotal} onAbrir={() => setModalAberto(true)} onRemover={remover} onAdicionar={adicionar} />
            </div>
          </div>
        )}

        {/* ════════ VIEW: PASTÉIS DOCES ════════ */}
        {view === 'doces' && (
          <div className="app-body">
            <main className="app-scroll">
              <div style={{ padding: '0.75rem 1rem 0.25rem', color: 'rgba(255,255,255,0.38)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                🍫 Pastéis Doces
              </div>
              <div className="bebidas-grid">
                {PASTEIS_DOCES
                  .filter(d => !(cardapioState?.desativados || []).includes(d.id))
                  .map(doce => {
                    const qtd = qtdDoceNoCarrinho(doce.id)
                    const preco = cardapioState?.precos?.[doce.id] ?? doce.preco
                    return (
                      <div key={doce.id} className="beb-item" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '0.875rem 1rem', gap: '0.875rem' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', margin: 0 }}>{doce.nome}</p>
                            <p style={{ color: '#F5C800', fontWeight: 900, fontSize: '1rem', margin: '4px 0 0' }}>
                              R$ {preco.toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{
                              width: '78px', height: '78px',
                              background: 'rgba(255,255,255,0.05)',
                              borderRadius: '12px',
                              border: qtd > 0 ? '1.5px solid rgba(245,200,0,0.35)' : '1px solid rgba(255,255,255,0.09)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '2.4rem',
                            }}>
                              🍫
                            </div>
                            {qtd === 0 ? (
                              <button onClick={() => handleAdicionarDoce(doce)} style={{
                                position: 'absolute', bottom: '-8px', right: '-8px',
                                width: '30px', height: '30px', borderRadius: '50%',
                                background: 'linear-gradient(145deg, #E00000, #A00000)',
                                border: '2px solid rgba(26,0,0,0.6)', color: '#fff', fontSize: '1.15rem', fontWeight: 900,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.5)', lineHeight: 1, touchAction: 'manipulation',
                              }}>+</button>
                            ) : (
                              <button
                                onClick={() => setQtdPopup({ type: 'doce', item: doce })}
                                style={{
                                  position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'rgba(10,0,0,0.95)', border: '1.5px solid rgba(245,200,0,0.5)', borderRadius: '20px',
                                  padding: '4px 14px', cursor: 'pointer', touchAction: 'manipulation',
                                  color: '#F5C800', fontWeight: 900, fontSize: '0.88rem', gap: '4px',
                                }}
                              >
                                <span style={{ fontSize: '0.7rem' }}>−</span>
                                <span>{qtd}</span>
                                <span style={{ fontSize: '0.7rem' }}>+</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </main>
            <div className="sidebar-desktop">
              <CarrinhoSidebar itens={itens} subtotal={subtotal} onAbrir={() => setModalAberto(true)} onRemover={remover} onAdicionar={adicionar} />
            </div>
          </div>
        )}

        {/* ════════ VIEW: BEBIDAS ════════ */}
        {view === 'bebidas' && (
          <div className="app-body">
            <main className="app-scroll">
              <div style={{ padding: '0.75rem 1rem 0.25rem', color: 'rgba(255,255,255,0.38)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Bebidas
              </div>
              <div className="bebidas-grid">
              {categorias[0].itens
                .filter(beb => !(cardapioState?.desativados || []).includes(beb.id))
                .map(beb => {
                  const saboresEfetivos = bebidaSaboresMap[beb.id] ?? beb.sabores ?? []
                  const qtd = qtdBebidaNoCarrinho(beb.id)
                  const temSabores = saboresEfetivos.length > 0
                  const seletorAberto = saborSeletor === beb.id
                  const preco = cardapioState?.precos?.[beb.id] ?? beb.preco
                  return (
                    <div key={beb.id} className="beb-item" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {/* Linha principal */}
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        padding: '0.875rem 1rem', gap: '0.875rem',
                      }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', margin: 0 }}>{beb.nome}</p>
                          {beb.subtitulo && (
                            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', margin: '2px 0 0' }}>{beb.subtitulo}</p>
                          )}
                          {temSabores && (
                            <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: '0.72rem', margin: '2px 0 0' }}>
                              {saboresEfetivos.join(' · ')}
                            </p>
                          )}
                          <p style={{ color: '#F5C800', fontWeight: 900, fontSize: '1rem', margin: '4px 0 0' }}>
                            R$ {preco.toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          {/* Imagem ou emoji */}
                          <div style={{
                            width: '78px', height: '78px',
                            background: beb.imagem ? 'transparent' : 'rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            border: qtd > 0 ? '1.5px solid rgba(245,200,0,0.35)' : (beb.imagem ? 'none' : '1px solid rgba(255,255,255,0.09)'),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '2.4rem', overflow: 'hidden',
                          }}>
                            {beb.imagem
                              ? <img src={beb.imagem} alt={beb.nome} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                              : '🥤'
                            }
                          </div>
                          {/* Botão + ou contador (sem sabores) */}
                          {!temSabores && (
                            qtd === 0 ? (
                              <button onClick={() => handleAdicionarBebida(beb)} style={{
                                position: 'absolute', bottom: '-8px', right: '-8px',
                                width: '30px', height: '30px', borderRadius: '50%',
                                background: 'linear-gradient(145deg, #E00000, #A00000)',
                                border: '2px solid rgba(26,0,0,0.6)', color: '#fff', fontSize: '1.15rem', fontWeight: 900,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.5)', lineHeight: 1, touchAction: 'manipulation',
                              }}>+</button>
                            ) : (
                              <button
                                onClick={() => setQtdPopup({ type: 'bebida', item: beb })}
                                style={{
                                  position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'rgba(10,0,0,0.95)', border: '1.5px solid rgba(245,200,0,0.5)', borderRadius: '20px',
                                  padding: '4px 14px', cursor: 'pointer', touchAction: 'manipulation',
                                  color: '#F5C800', fontWeight: 900, fontSize: '0.88rem', gap: '4px',
                                }}
                              >
                                <span style={{ fontSize: '0.7rem' }}>−</span>
                                <span>{qtd}</span>
                                <span style={{ fontSize: '0.7rem' }}>+</span>
                              </button>
                            )
                          )}
                          {/* Botão escolher sabor */}
                          {temSabores && (
                            <button
                              onClick={() => setSaborSeletor(seletorAberto ? null : beb.id)}
                              style={{
                                position: 'absolute', bottom: '-8px', right: '-8px',
                                width: '30px', height: '30px', borderRadius: '50%',
                                background: qtd > 0
                                  ? 'linear-gradient(145deg, #c9a200, #a07800)'
                                  : 'linear-gradient(145deg, #E00000, #A00000)',
                                border: '2px solid rgba(26,0,0,0.6)', color: '#fff', fontSize: qtd > 0 ? '0.65rem' : '1.15rem', fontWeight: 900,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.5)', lineHeight: 1, touchAction: 'manipulation',
                              }}
                            >
                              {qtd > 0 ? qtd : '+'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Seletor de sabores inline */}
                      {temSabores && seletorAberto && (
                        <div style={{
                          padding: '0 1rem 1rem',
                          display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
                        }}>
                          {saboresEfetivos.map(sabor => {
                            const qtdSabor = qtdSaborNoCarrinho(beb.id, sabor)
                            const chave = `beb-${beb.id}-${sabor}`
                            const img = beb.imagens?.[sabor] ?? beb.imagem
                            return (
                              <div key={sabor} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                padding: '0.5rem 0.5rem 0.4rem', borderRadius: '12px',
                                minWidth: '68px', maxWidth: '80px',
                                background: qtdSabor > 0 ? 'rgba(245,200,0,0.10)' : 'rgba(255,255,255,0.05)',
                                border: `1.5px solid ${qtdSabor > 0 ? 'rgba(245,200,0,0.4)' : 'rgba(255,255,255,0.10)'}`,
                                transition: 'all 0.15s', gap: '5px',
                              }}>
                                <div style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {img
                                    ? <img src={img} alt={sabor} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    : <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>🥤</span>
                                  }
                                </div>
                                <span style={{ color: qtdSabor > 0 ? '#F5C800' : 'rgba(255,255,255,0.85)', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, width: '100%' }}>{sabor}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  {qtdSabor > 0 ? (
                                    <button
                                      onClick={() => setQtdPopup({ type: 'bebida', item: beb, sabor })}
                                      style={{
                                        background: 'rgba(245,200,0,0.15)', border: '1px solid rgba(245,200,0,0.4)',
                                        borderRadius: '8px', cursor: 'pointer', padding: '2px 8px',
                                        color: '#F5C800', fontSize: '0.82rem', fontWeight: 900, touchAction: 'manipulation',
                                        display: 'flex', alignItems: 'center', gap: '3px',
                                      }}
                                    >
                                      <span style={{ fontSize: '0.7rem' }}>−</span>
                                      <span>{qtdSabor}</span>
                                      <span style={{ fontSize: '0.7rem' }}>+</span>
                                    </button>
                                  ) : (
                                    <button onClick={() => handleAdicionarBebida(beb, sabor)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 900, padding: '0 1px', touchAction: 'manipulation', lineHeight: 1 }}>+</button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </main>
            <div className="sidebar-desktop">
              <CarrinhoSidebar itens={itens} subtotal={subtotal} onAbrir={() => setModalAberto(true)} onRemover={remover} onAdicionar={adicionar} />
            </div>
          </div>
        )}

        {/* ════════ VIEW: CARRINHO ════════ */}
        {view === 'carrinho' && (
          <TelaCarrinho
            itens={itens}
            subtotal={subtotal}
            onVoltar={() => setView('cardapio')}
            onFinalizar={() => setView('upsell')}
            onRemover={remover}
            onAdicionar={adicionar}
            onLimpar={limpar}
          />
        )}

        {/* ════════ VIEW: DIVERSOS ════════ */}
        {view === 'diversos' && (
          <div className="app-body">
            <main className="app-scroll">
              <div style={{ padding: '0.75rem 1rem 0.25rem', color: 'rgba(255,255,255,0.38)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                📦 Diversos
              </div>
              {catalogoItens.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '2rem 1rem', fontSize: '0.85rem' }}>
                  Nenhum item disponível no momento.
                </p>
              ) : (
                <div className="bebidas-grid">
                  {catalogoItens.map(item => {
                    const chave = `div-${item.id}`
                    const qtd = itens.filter(i => i.chave === chave).reduce((s, i) => s + i.qtd, 0)
                    return (
                      <div key={item.id} className="beb-item" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '0.875rem 1rem', gap: '0.875rem' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', margin: 0 }}>{item.nome}</p>
                            <p style={{ color: '#F5C800', fontWeight: 900, fontSize: '1rem', margin: '4px 0 0' }}>
                              R$ {Number(item.preco).toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{
                              width: '78px', height: '78px',
                              background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
                              border: qtd > 0 ? '1.5px solid rgba(245,200,0,0.35)' : '1px solid rgba(255,255,255,0.09)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '2.4rem',
                            }}>📦</div>
                            {qtd === 0 ? (
                              <button
                                onClick={() => adicionar({ chave, tipoId: 'diverso', nome: item.nome, preco: Number(item.preco), qtd: 1 })}
                                style={{
                                  position: 'absolute', bottom: '-8px', right: '-8px',
                                  width: '30px', height: '30px', borderRadius: '50%',
                                  background: 'linear-gradient(145deg, #E00000, #A00000)',
                                  border: '2px solid rgba(26,0,0,0.6)', color: '#fff', fontSize: '1.15rem', fontWeight: 900,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)', lineHeight: 1, touchAction: 'manipulation',
                                }}
                              >+</button>
                            ) : (
                              <button
                                onClick={() => setQtdPopup({ type: 'diverso', item })}
                                style={{
                                  position: 'absolute', bottom: '-10px', left: '50%', transform: 'translateX(-50%)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'rgba(10,0,0,0.95)', border: '1.5px solid rgba(245,200,0,0.5)', borderRadius: '20px',
                                  padding: '4px 14px', cursor: 'pointer', touchAction: 'manipulation',
                                  color: '#F5C800', fontWeight: 900, fontSize: '0.88rem', gap: '4px',
                                }}
                              >
                                <span style={{ fontSize: '0.7rem' }}>−</span>
                                <span>{qtd}</span>
                                <span style={{ fontSize: '0.7rem' }}>+</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
                <a href="/acompanhar" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textDecoration: 'none' }}>
                  📍 Acompanhar pedido
                </a>
              </div>
            </main>
            <div className="sidebar-desktop">
              <CarrinhoSidebar itens={itens} subtotal={subtotal} onAbrir={() => setModalAberto(true)} onRemover={remover} onAdicionar={adicionar} />
            </div>
          </div>
        )}

        {/* ════════ VIEW: UPSELL BEBIDAS ════════ */}
        {view === 'upsell' && (
          <TelaUpsell
            itens={itens}
            bebidas={categorias[0].itens.map(b => ({ ...b, sabores: bebidaSaboresMap[b.id] ?? b.sabores }))}
            onContinuar={() => { setView('cardapio'); setModalAberto(true) }}
            onPular={() => { setView('cardapio'); setModalAberto(true) }}
            onAdicionar={(beb, sabor) => {
              const chave = sabor ? `beb-${beb.id}-${sabor}` : `beb-${beb.id}`
              const nome = sabor ? `${beb.nome} ${sabor}` : beb.nome
              adicionar({ chave, tipoId: 'bebida', nome, preco: beb.preco })
            }}
            onRemover={(chave) => remover(chave)}
          />
        )}

        {/* ════════ BOTTOM NAV (mobile) ════════ */}
        <nav className="bottom-nav">
          <button
            onClick={() => setView('cardapio')}
            className={`bottom-nav-btn ${(view === 'cardapio' || view === 'doces' || view === 'bebidas') ? 'bottom-nav-active' : ''}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Início</span>
          </button>

          <button
            onClick={() => setView('carrinho')}
            className={`bottom-nav-btn ${view === 'carrinho' ? 'bottom-nav-active' : ''}`}
            style={{ position: 'relative' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {totalItens > 0 && (
              <span className="badge-pulse" style={{
                position: 'absolute', top: '8px', right: 'calc(50% - 20px)',
                background: '#CC0000', color: '#fff',
                borderRadius: '50%', width: '17px', height: '17px',
                fontSize: '0.65rem', fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid rgba(5,0,0,0.95)',
                lineHeight: 1,
              }}>
                {totalItens > 9 ? '9+' : totalItens}
              </span>
            )}
            <span>Carrinho</span>
          </button>
        </nav>

        {/* ── MODAIS ── */}
        <ModalSabores
          tipo={tipoSelecionado}
          isOpen={!!tipoSelecionado}
          onFechar={() => setTipoSelecionado(null)}
          onAdicionar={handleAdicionarPastel}
          desativados={cardapioState?.desativados || []}
        />
        <ModalPedido
          aberto={modalAberto}
          onFechar={() => setModalAberto(false)}
          itens={itens}
          subtotal={subtotal}
          onLimpar={limpar}
          configLoja={cardapioState}
        />

        {/* ── POPUP MAIONESE TEMPERADA ── */}
        {showMaioPopup && (
          <div
            onClick={() => setShowMaioPopup(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 500,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              padding: '0 1rem 5rem',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'rgba(16,0,0,0.98)', border: '1.5px solid rgba(245,200,0,0.35)',
                borderRadius: '20px', padding: '1.1rem 1.25rem',
                width: '100%', maxWidth: '380px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.875rem' }}>
                <span style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>🥫</span>
                <div>
                  <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', margin: 0 }}>
                    Quer adicionar Maionese Temperada?
                  </p>
                  <p style={{ color: '#F5C800', fontWeight: 900, fontSize: '1.05rem', margin: '2px 0 0' }}>
                    R$ 1,50
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    adicionar({ chave: 'maionese-temperada', tipoId: 'avulso', nome: 'Maionese Temperada', preco: 1.50 })
                    setShowMaioPopup(false)
                  }}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(145deg, #CC0000, #880000)',
                    color: '#fff', fontWeight: 800, fontSize: '0.9rem', touchAction: 'manipulation',
                  }}
                >
                  Sim, quero!
                </button>
                <button
                  onClick={() => setShowMaioPopup(false)}
                  style={{
                    padding: '0.7rem 1.1rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: '0.85rem', touchAction: 'manipulation',
                  }}
                >
                  Não
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── QUANTITY POPUP (mobile-friendly big buttons) ── */}
        {qtdPopup && (() => {
          let currentQtd = 0
          let itemName = ''
          let itemPrice = 0

          if (qtdPopup.type === 'doce') {
            currentQtd = qtdDoceNoCarrinho(qtdPopup.item.id)
            itemName = qtdPopup.item.nome
            itemPrice = cardapioState?.precos?.[qtdPopup.item.id] ?? qtdPopup.item.preco
          } else if (qtdPopup.type === 'bebida') {
            if (qtdPopup.sabor) {
              currentQtd = qtdSaborNoCarrinho(qtdPopup.item.id, qtdPopup.sabor)
              itemName = `${qtdPopup.item.nome} ${qtdPopup.sabor}`
            } else {
              currentQtd = qtdBebidaNoCarrinho(qtdPopup.item.id)
              itemName = qtdPopup.item.nome
            }
            itemPrice = cardapioState?.precos?.[qtdPopup.item.id] ?? qtdPopup.item.preco
          } else if (qtdPopup.type === 'diverso') {
            const chave = `div-${qtdPopup.item.id}`
            currentQtd = itens.filter(i => i.chave === chave).reduce((s, i) => s + i.qtd, 0)
            itemName = qtdPopup.item.nome
            itemPrice = Number(qtdPopup.item.preco)
          }

          function handleAdd() {
            if (qtdPopup.type === 'doce') handleAdicionarDoce(qtdPopup.item)
            else if (qtdPopup.type === 'diverso') adicionar({ chave: `div-${qtdPopup.item.id}`, tipoId: 'diverso', nome: qtdPopup.item.nome, preco: Number(qtdPopup.item.preco), qtd: 1 })
            else if (qtdPopup.sabor) handleAdicionarBebida(qtdPopup.item, qtdPopup.sabor)
            else handleAdicionarBebida(qtdPopup.item)
          }

          function handleRemove() {
            if (qtdPopup.type === 'doce') remover(qtdPopup.item.id)
            else if (qtdPopup.type === 'diverso') remover(`div-${qtdPopup.item.id}`)
            else if (qtdPopup.sabor) handleRemoverBebida(`beb-${qtdPopup.item.id}-${qtdPopup.sabor}`)
            else handleRemoverBebida(`beb-${qtdPopup.item.id}`)
          }

          return (
            <div
              onClick={() => setQtdPopup(null)}
              style={{
                position: 'fixed', inset: 0, zIndex: 400,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'rgba(24,0,0,0.98)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '20px', padding: '1.5rem', width: '100%', maxWidth: '300px',
                  textAlign: 'center', backdropFilter: 'blur(20px)',
                }}
              >
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', marginBottom: '4px' }}>{itemName}</div>
                <div style={{ color: '#F5C800', fontWeight: 900, fontSize: '1rem', marginBottom: '1.25rem' }}>
                  R$ {itemPrice.toFixed(2).replace('.', ',')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                  <button
                    onClick={handleRemove}
                    disabled={currentQtd <= 0}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px', cursor: currentQtd > 0 ? 'pointer' : 'not-allowed',
                      background: currentQtd > 0 ? 'rgba(204,0,0,0.3)' : 'rgba(255,255,255,0.05)',
                      border: `2px solid ${currentQtd > 0 ? 'rgba(204,0,0,0.6)' : 'rgba(255,255,255,0.1)'}`,
                      color: currentQtd > 0 ? '#ff6666' : 'rgba(255,255,255,0.4)',
                      fontSize: '1.6rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation',
                    }}
                  >−</button>
                  <span style={{
                    color: '#fff', fontWeight: 900, fontSize: '2rem', minWidth: '48px', textAlign: 'center',
                    fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '1px',
                  }}>{currentQtd}</span>
                  <button
                    onClick={handleAdd}
                    style={{
                      width: '52px', height: '52px', borderRadius: '14px', cursor: 'pointer',
                      background: 'linear-gradient(145deg, #E00000, #A00000)',
                      border: '2px solid rgba(255,255,255,0.1)',
                      color: '#fff', fontSize: '1.6rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation',
                    }}
                  >+</button>
                </div>
                <button
                  onClick={() => setQtdPopup(null)}
                  style={{
                    width: '100%', padding: '0.875rem', borderRadius: '14px', cursor: 'pointer',
                    fontSize: '0.95rem', fontWeight: 800, border: 'none',
                    background: 'linear-gradient(145deg, #F5C800, #d4a800)',
                    color: '#1a1000', touchAction: 'manipulation',
                  }}
                >
                  Confirmar
                </button>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
