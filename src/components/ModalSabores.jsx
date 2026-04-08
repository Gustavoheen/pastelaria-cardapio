import { useState, useEffect, useRef } from 'react'
import { SABORES_SALGADOS, SABORES_DOCES, ADICIONAIS_LISTA } from '../data/cardapio.js'

export default function ModalSabores({ tipo, isOpen, onFechar, onAdicionar, desativados = [] }) {
  const [saboresSel, setSaboresSel] = useState([])
  const [adicionaisSel, setAdicionaisSel] = useState([])
  const [observacao, setObservacao] = useState('')

  const modalScrollRef = useRef(null)
  const adicionaisRef  = useRef(null)
  const finalizarRef   = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setSaboresSel([])
      setAdicionaisSel([])
      setObservacao('')
    }
  }, [isOpen, tipo])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen || !tipo) return null

  const saboresDisponiveis = (tipo.tipo === 'doce' ? SABORES_DOCES : SABORES_SALGADOS)
    .filter(s => !desativados.includes(`sabor-${s}`))
  const adicionaisDisponiveis = ADICIONAIS_LISTA.filter(a => !desativados.includes(`adicional-${a}`))

  // Rola o modal até o elemento de referência
  function scrollPara(ref, delay = 120) {
    setTimeout(() => {
      if (!ref.current || !modalScrollRef.current) return
      const container = modalScrollRef.current
      const delta = ref.current.getBoundingClientRect().top - container.getBoundingClientRect().top - 12
      container.scrollBy({ top: delta, behavior: 'smooth' })
    }, delay)
  }

  function toggleSabor(sabor) {
    setSaboresSel(prev => {
      if (prev.includes(sabor)) return prev.filter(s => s !== sabor)
      if (prev.length >= tipo.maxSabores) return prev
      const next = [...prev, sabor]
      if (next.length === tipo.maxSabores) {
        // Vai pra adicionais, ou direto pro botão se não houver
        scrollPara(tipo.maxAdicionais > 0 ? adicionaisRef : finalizarRef)
      }
      return next
    })
  }

  function toggleAdicional(adicional) {
    setAdicionaisSel(prev => {
      if (prev.includes(adicional)) return prev.filter(a => a !== adicional)
      if (prev.length >= tipo.maxAdicionais) return prev
      const next = [...prev, adicional]
      if (next.length === tipo.maxAdicionais) {
        scrollPara(finalizarRef)
      }
      return next
    })
  }

  function handleAdicionar() {
    if (saboresSel.length === 0) return
    const chave = `${tipo.id}-${saboresSel.sort().join(',')}-${adicionaisSel.sort().join(',')}-${Date.now()}`
    onAdicionar({
      chave,
      tipoId: tipo.id,
      nome: tipo.nome,
      sabores: saboresSel,
      adicionais: adicionaisSel,
      observacao: observacao.trim(),
      preco: tipo.preco,
    })
    onFechar()
  }

  const podeAdicionar = saboresSel.length > 0
  const saboresCompletos = saboresSel.length >= tipo.maxSabores
  const adicionaisCompletos = tipo.maxAdicionais > 0 && adicionaisSel.length >= tipo.maxAdicionais

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onFechar}
        className="animate-fade-in"
        style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      {/* Modal */}
      <div
        ref={modalScrollRef}
        className="animate-slide-up"
        style={{
          position: 'fixed', zIndex: 90,
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '95%', maxWidth: '480px',
          maxHeight: '90vh', overflowY: 'auto',
          background: 'linear-gradient(160deg, rgba(40,0,0,0.97), rgba(26,0,0,0.98))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(145deg, rgba(100,0,0,0.8), rgba(60,0,0,0.9))',
          padding: '1.1rem 1.25rem',
          borderRadius: '20px 20px 0 0',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 2,
        }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.65rem', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>
              Personalize seu Pastel
            </p>
            <h2 style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', margin: '2px 0 0', letterSpacing: '1px' }}>
              {tipo.nome}
            </h2>
            <p style={{ color: '#F5C800', fontSize: '0.9rem', fontWeight: 900, margin: '2px 0 0' }}>
              R$ {tipo.preco.toFixed(2).replace('.', ',')}
            </p>
          </div>
          <button onClick={onFechar} className="btn-glass" style={{ borderRadius: '10px', width: '36px', height: '36px', fontSize: '1rem', flexShrink: 0 }}>✕</button>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: '1.25rem' }}>

          {/* ── SABORES ── */}
          <div style={{ marginBottom: tipo.maxAdicionais > 0 ? '1.5rem' : '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '0.9rem', margin: 0 }}>
                  Escolha os Sabores
                </h3>
                {saboresCompletos && (
                  <span style={{ fontSize: '0.75rem', color: '#6aff9e' }}>✓</span>
                )}
              </div>
              <span style={{
                background: saboresCompletos ? 'rgba(106,255,158,0.15)' : 'rgba(255,255,255,0.08)',
                color: saboresCompletos ? '#6aff9e' : 'rgba(255,255,255,0.6)',
                fontSize: '0.72rem', fontWeight: 700,
                padding: '3px 10px', borderRadius: '20px',
                border: `1px solid ${saboresCompletos ? 'rgba(106,255,158,0.35)' : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.2s ease',
              }}>
                {saboresSel.length}/{tipo.maxSabores}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
              {saboresDisponiveis.map(sabor => {
                const selecionado = saboresSel.includes(sabor)
                const desabilitado = !selecionado && saboresSel.length >= tipo.maxSabores
                return (
                  <label
                    key={sabor}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 0.75rem', borderRadius: '10px',
                      cursor: desabilitado ? 'not-allowed' : 'pointer',
                      background: selecionado ? 'rgba(200,0,0,0.25)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${selecionado ? 'rgba(220,0,0,0.6)' : 'rgba(255,255,255,0.08)'}`,
                      transition: 'all 0.15s ease',
                      opacity: desabilitado ? 0.4 : 1,
                    }}
                  >
                    <input type="checkbox" checked={selecionado} onChange={() => !desabilitado && toggleSabor(sabor)} disabled={desabilitado} className="check-glass" />
                    <span style={{ color: selecionado ? '#fff' : 'rgba(255,255,255,0.75)', fontSize: '0.8rem', fontWeight: selecionado ? 700 : 400 }}>
                      {sabor}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── ADICIONAIS ── */}
          {tipo.maxAdicionais > 0 && (
            <div ref={adicionaisRef} style={{ marginBottom: '1.25rem', scrollMarginTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '0.9rem', margin: 0 }}>
                    Adicionais Grátis
                  </h3>
                  {adicionaisCompletos && (
                    <span style={{ fontSize: '0.75rem', color: '#6aff9e' }}>✓</span>
                  )}
                </div>
                <span style={{
                  background: adicionaisCompletos ? 'rgba(106,255,158,0.15)' : 'rgba(255,255,255,0.08)',
                  color: adicionaisCompletos ? '#6aff9e' : 'rgba(255,255,255,0.6)',
                  fontSize: '0.72rem', fontWeight: 700,
                  padding: '3px 10px', borderRadius: '20px',
                  border: `1px solid ${adicionaisCompletos ? 'rgba(106,255,158,0.35)' : 'rgba(255,255,255,0.1)'}`,
                  transition: 'all 0.2s ease',
                }}>
                  {adicionaisSel.length}/{tipo.maxAdicionais}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
                {adicionaisDisponiveis.map(adicional => {
                  const selecionado = adicionaisSel.includes(adicional)
                  const desabilitado = !selecionado && adicionaisSel.length >= tipo.maxAdicionais
                  return (
                    <label
                      key={adicional}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.75rem', borderRadius: '10px',
                        cursor: desabilitado ? 'not-allowed' : 'pointer',
                        background: selecionado ? 'rgba(245,200,0,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${selecionado ? 'rgba(245,200,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
                        transition: 'all 0.15s ease',
                        opacity: desabilitado ? 0.4 : 1,
                      }}
                    >
                      <input type="checkbox" checked={selecionado} onChange={() => !desabilitado && toggleAdicional(adicional)} disabled={desabilitado} className="check-glass" />
                      <span style={{ flex: 1, color: selecionado ? '#fff' : 'rgba(255,255,255,0.75)', fontSize: '0.8rem', fontWeight: selecionado ? 700 : 400 }}>
                        {adicional}
                      </span>
                      <span style={{ color: '#F5C800', fontSize: '0.6rem', fontWeight: 800, background: 'rgba(245,200,0,0.15)', padding: '1px 5px', borderRadius: '4px', flexShrink: 0 }}>
                        GRÁTIS
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── OBSERVAÇÃO ── */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
              Observações (opcional)
            </label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: sem cebola, bem passado..."
              rows={2}
              className="input-glass"
              style={{ width: '100%', padding: '0.55rem 0.875rem', borderRadius: '10px', fontSize: '0.85rem', resize: 'vertical' }}
            />
          </div>

          {/* ── BOTÕES ── */}
          <div ref={finalizarRef} style={{ display: 'flex', gap: '0.75rem', scrollMarginTop: '12px' }}>
            <button onClick={onFechar} className="btn-glass" style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', fontSize: '0.9rem' }}>
              Cancelar
            </button>
            <button
              onClick={handleAdicionar}
              disabled={!podeAdicionar}
              className="btn-brand"
              style={{
                flex: 2, padding: '0.75rem', borderRadius: '12px', fontSize: '0.95rem',
                opacity: podeAdicionar ? 1 : 0.45,
                cursor: podeAdicionar ? 'pointer' : 'not-allowed',
              }}
            >
              {podeAdicionar
                ? `Adicionar — R$ ${tipo.preco.toFixed(2).replace('.', ',')}`
                : `Selecione ${tipo.maxSabores > 1 ? 'ao menos 1 sabor' : 'o sabor'}`
              }
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
