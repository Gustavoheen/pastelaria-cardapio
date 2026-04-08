import { useState, useEffect } from 'react'
import { CONFIG } from '../config.js'

const STATUS_INFO = {
  recebido:   { label: 'Pedido Recebido',     emoji: '📋', cor: '#F5C800', desc: 'Seu pedido foi recebido e será preparado em breve.' },
  preparando: { label: 'Em Preparo',           emoji: '🔥', cor: '#CC0000', desc: 'Nosso time está preparando seu pedido!' },
  pronto:     { label: 'Pronto p/ Retirada',  emoji: '✅', cor: '#00c853', desc: 'Seu pedido está pronto. Pode vir buscar!' },
  entregue:   { label: 'Retirado',             emoji: '🎉', cor: '#888',    desc: 'Pedido entregue. Bom apetite!' },
}

const STATUS_ORDEM = ['recebido', 'preparando', 'pronto', 'entregue']

function fmtHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtMoeda(v) {
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`
}

function ProgressoStatus({ status }) {
  const idxAtual = STATUS_ORDEM.indexOf(status)

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem 0.5rem', gap: 0 }}>
      {STATUS_ORDEM.map((s, idx) => {
        const info = STATUS_INFO[s] || {}
        const feito = idx <= idxAtual
        const ativo = idx === idxAtual
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: ativo ? '44px' : '34px',
                height: ativo ? '44px' : '34px',
                borderRadius: '50%',
                background: feito
                  ? `linear-gradient(145deg, ${info.cor}cc, ${info.cor}88)`
                  : 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: ativo ? '1.3rem' : '1rem',
                boxShadow: ativo
                  ? `0 0 0 4px ${info.cor}33, 0 4px 16px rgba(0,0,0,0.4)`
                  : feito
                    ? '0 2px 8px rgba(0,0,0,0.3)'
                    : 'none',
                border: `2px solid ${feito ? info.cor + '88' : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.3s ease',
              }}>
                {info.emoji}
              </div>
              <span style={{
                fontSize: '0.6rem', marginTop: '5px', textAlign: 'center', maxWidth: '64px',
                color: feito ? info.cor : 'rgba(255,255,255,0.3)',
                fontWeight: ativo ? 700 : 400,
                lineHeight: 1.3,
              }}>
                {info.label}
              </span>
            </div>
            {idx < STATUS_ORDEM.length - 1 && (
              <div style={{
                width: '28px', height: '3px', margin: '0 2px', marginBottom: '18px',
                background: idx < idxAtual
                  ? `linear-gradient(90deg, ${STATUS_INFO[STATUS_ORDEM[idx]].cor}88, ${STATUS_INFO[STATUS_ORDEM[idx + 1]].cor}88)`
                  : 'rgba(255,255,255,0.08)',
                borderRadius: '2px',
                transition: 'background 0.3s ease',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function CardAcompanhar({ pedido }) {
  const info = STATUS_INFO[pedido.status] || STATUS_INFO.recebido
  const itens = Array.isArray(pedido.itens) ? pedido.itens : JSON.parse(pedido.itens || '[]')

  return (
    <div
      className="glass-card animate-slide-up"
      style={{
        borderRadius: '16px',
        overflow: 'hidden',
        marginBottom: '1rem',
        border: `1px solid ${info.cor}33`,
      }}
    >
      {/* Header */}
      <div style={{
        background: `linear-gradient(145deg, ${info.cor}22, ${info.cor}11)`,
        padding: '1rem',
        borderBottom: `1px solid ${info.cor}22`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1rem', letterSpacing: '1px' }}>
              Pedido {pedido.numero}
            </span>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', margin: '2px 0 0' }}>
              {fmtHora(pedido.created_at)}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              background: info.cor + '33',
              color: info.cor,
              border: `1px solid ${info.cor}55`,
              fontSize: '0.72rem', fontWeight: 700,
              padding: '3px 12px', borderRadius: '20px',
              display: 'inline-block',
            }}>
              {info.emoji} {info.label}
            </span>
            <p style={{ color: '#F5C800', fontWeight: 900, fontSize: '0.95rem', margin: '4px 0 0' }}>
              {fmtMoeda(pedido.total)}
            </p>
          </div>
        </div>

        <div style={{
          marginTop: '0.75rem', padding: '0.5rem 0.75rem',
          background: `${info.cor}15`,
          border: `1px solid ${info.cor}22`,
          borderRadius: '10px',
          fontSize: '0.82rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600,
        }}>
          {info.desc}
        </div>
      </div>

      {/* Progresso */}
      <div style={{ background: 'rgba(0,0,0,0.2)' }}>
        <ProgressoStatus status={pedido.status} />
      </div>

      {/* Itens */}
      <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {itens.map((item, i) => {
          const nome = item.nome || 'Item'
          return (
            <div key={i} style={{
              paddingBottom: '0.4rem', marginBottom: '0.4rem',
              borderBottom: i < itens.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#fff', fontWeight: 700 }}>
                  {item.qtd}x {nome}
                </span>
                <span style={{ color: '#F5C800', fontWeight: 700 }}>
                  {fmtMoeda(item.preco * item.qtd)}
                </span>
              </div>
              {item.sabores && item.sabores.length > 0 && (
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', margin: '1px 0 0' }}>
                  Sabores: {item.sabores.join(', ')}
                </p>
              )}
              {item.adicionais && item.adicionais.length > 0 && (
                <p style={{ color: 'rgba(245,200,0,0.6)', fontSize: '0.7rem', margin: '1px 0 0' }}>
                  Adicionais: {item.adicionais.join(', ')}
                </p>
              )}
            </div>
          )
        })}

        <div style={{
          marginTop: '0.5rem', paddingTop: '0.5rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Retirada na loja</span>
          <span>{pedido.pagamento?.toUpperCase()}</span>
        </div>
      </div>
    </div>
  )
}

export default function AcompanharPedido() {
  const params = new URLSearchParams(window.location.search)
  const telInicial = params.get('tel') || ''

  const [telefone, setTelefone] = useState(telInicial)
  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [buscou, setBuscou] = useState(false)
  const [erro, setErro] = useState('')

  async function buscar() {
    if (!telefone.trim()) { setErro('Informe o telefone.'); return }
    setCarregando(true)
    setErro('')
    try {
      const res = await fetch(`/api/pedido?telefone=${encodeURIComponent(telefone.replace(/\D/g, ''))}`)
      if (!res.ok) throw new Error('Erro ao buscar pedidos')
      const data = await res.json()
      setPedidos(Array.isArray(data) ? data : [])
      setBuscou(true)
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (telInicial) buscar()
  }, [])

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '1.1rem 1.25rem',
        textAlign: 'center',
      }}>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.65rem', letterSpacing: '3px', textTransform: 'uppercase', margin: 0 }}>
          Acompanhe seu Pedido
        </p>
        <h1 style={{
          color: '#F5C800',
          fontFamily: 'Bebas Neue, sans-serif',
          fontSize: '1.6rem',
          letterSpacing: '2px',
          margin: '4px 0 0',
          textShadow: '0 0 16px rgba(245,200,0,0.3)',
        }}>
          {CONFIG.nomeLoja}
        </h1>
      </header>

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '1.5rem 1rem' }}>

        {/* Busca */}
        <div
          className="glass-card"
          style={{ borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem' }}
        >
          <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.875rem' }}>
            Digite seu número de telefone:
          </p>
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <input
              type="tel"
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder="(XX) XXXXX-XXXX"
              className="input-glass"
              style={{ flex: 1, padding: '0.6rem 0.875rem', borderRadius: '10px', fontSize: '0.9rem' }}
            />
            <button
              onClick={buscar}
              disabled={carregando}
              className="btn-brand"
              style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
            >
              {carregando ? '...' : 'Buscar'}
            </button>
          </div>
          {erro && (
            <p style={{ color: '#ff6666', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 700 }}>{erro}</p>
          )}
        </div>

        {/* Resultados */}
        {buscou && (
          pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize: '2.5rem' }}>📋</div>
              <p style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                Nenhum pedido encontrado para este telefone.
              </p>
            </div>
          ) : (
            <>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {pedidos.length} pedido(s) encontrado(s)
              </p>
              {pedidos.map(p => (
                <CardAcompanhar key={p.id} pedido={p} />
              ))}
            </>
          )
        )}

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <a href="/" style={{ color: '#F5C800', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none' }}>
            Voltar ao cardápio
          </a>
        </div>
      </div>
    </div>
  )
}
