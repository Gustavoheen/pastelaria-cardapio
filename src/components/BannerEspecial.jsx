import { useState, useEffect } from 'react'
import { CONFIG } from '../config.js'

export default function BannerEspecial({ especial, onAdicionar }) {
  const [adicionado, setAdicionado] = useState(false)

  // Contador regressivo até o fechamento
  const [tempoRestante, setTempoRestante] = useState('')

  useEffect(() => {
    function calcTempo() {
      const agora = new Date()
      const [h, m] = (CONFIG.horarioFechamento || '22:00').split(':').map(Number)
      const fechamento = new Date()
      fechamento.setHours(h, m, 0, 0)
      const diff = fechamento - agora
      if (diff <= 0) { setTempoRestante(''); return }
      const horas = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      setTempoRestante(`${horas}h ${mins}min`)
    }
    calcTempo()
    const iv = setInterval(calcTempo, 30000)
    return () => clearInterval(iv)
  }, [])

  function handleAdicionar() {
    onAdicionar({
      chave: 'especial-xtudao',
      tipoId: 'especial',
      nome: especial.nome || CONFIG.especialNome,
      sabores: [],
      adicionais: [],
      observacao: '',
      preco: especial.preco ?? CONFIG.especialPreco,
    })
    setAdicionado(true)
    setTimeout(() => setAdicionado(false), 2500)
  }

  return (
    <div
      className="animate-pulse-border"
      style={{
        margin: '0 0 0 0',
        background: 'linear-gradient(135deg, rgba(100,0,0,0.85), rgba(50,0,0,0.9))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '2px solid #F5C800',
        borderRadius: '0',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Faixa brilho decorativa */}
      <div style={{
        position: 'absolute', top: 0, left: '-40px',
        width: '80px', height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(245,200,0,0.08), transparent)',
        transform: 'skewX(-15deg)',
        pointerEvents: 'none',
      }} />

      {/* Ícone + badge */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: '2.2rem', lineHeight: 1 }}>🥟</div>
        <div style={{
          background: '#F5C800',
          color: '#1a0000',
          fontSize: '0.55rem',
          fontWeight: 900,
          padding: '2px 6px',
          borderRadius: '4px',
          marginTop: '4px',
          letterSpacing: '1px',
          fontFamily: 'Bebas Neue, sans-serif',
        }}>
          ESPECIAL DO DIA
        </div>
      </div>

      {/* Conteúdo central */}
      <div style={{ flex: 1, minWidth: '160px' }}>
        <div style={{
          color: '#F5C800',
          fontFamily: 'Bebas Neue, sans-serif',
          fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',
          letterSpacing: '1px',
          lineHeight: 1.1,
          textShadow: '0 0 12px rgba(245,200,0,0.4)',
        }}>
          {especial.nome || CONFIG.especialNome}
        </div>
        <div style={{
          color: 'rgba(255,255,255,0.75)',
          fontSize: '0.78rem',
          marginTop: '2px',
          lineHeight: 1.3,
        }}>
          {especial.descricao || CONFIG.especialDescricao}
        </div>
        {tempoRestante && (
          <div style={{
            color: 'rgba(255,200,0,0.7)',
            fontSize: '0.7rem',
            marginTop: '4px',
          }}>
            Disponivel por mais {tempoRestante}
          </div>
        )}
      </div>

      {/* Preço + botão */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <div style={{
          color: '#F5C800',
          fontFamily: 'Bebas Neue, sans-serif',
          fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
          lineHeight: 1,
          textShadow: '0 0 16px rgba(245,200,0,0.5)',
        }}>
          R$ {Number(especial.preco ?? CONFIG.especialPreco).toFixed(2).replace('.', ',')}
        </div>
        <button
          onClick={handleAdicionar}
          className="btn-gold"
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '10px',
            fontSize: '0.85rem',
            marginTop: '0.4rem',
            whiteSpace: 'nowrap',
          }}
        >
          {adicionado ? 'Adicionado!' : 'Quero o X-Tudão!'}
        </button>
      </div>
    </div>
  )
}
