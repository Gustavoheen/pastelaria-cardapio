import { useState } from 'react'
import { categorias } from '../data/cardapio.js'

function CardBebidaUpsell({ beb, qtdTotal, qtdSabor, onAdicionar, onRemover, saborAtivo, onToggleSabor }) {
  const temSabores = beb.sabores && beb.sabores.length > 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0.75rem 0.5rem',
      background: qtdTotal > 0 ? 'rgba(245,200,0,0.08)' : 'rgba(255,255,255,0.04)',
      border: qtdTotal > 0 ? '1.5px solid rgba(245,200,0,0.35)' : '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px',
      transition: 'all 0.15s ease',
      gap: '0.4rem',
    }}>
      {/* Imagem ou emoji */}
      <div style={{ width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {beb.imagem
          ? <img src={beb.imagem} alt={beb.nome} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>🥤</span>
        }
      </div>
      <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', margin: 0, textAlign: 'center', lineHeight: 1.3 }}>
        {beb.nome}
      </p>
      <p style={{ color: '#F5C800', fontWeight: 900, fontSize: '0.85rem', margin: 0 }}>
        R$ {beb.preco.toFixed(2).replace('.', ',')}
      </p>

      {!temSabores && (
        qtdTotal === 0 ? (
          <button
            onClick={() => onAdicionar(beb, null)}
            className="btn-brand"
            style={{ padding: '0.35rem 0.85rem', borderRadius: '10px', fontSize: '0.75rem', marginTop: '2px', touchAction: 'manipulation' }}
          >
            + Add
          </button>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '10px', overflow: 'hidden', marginTop: '2px',
          }}>
            <button onClick={() => onRemover(`beb-${beb.id}`)} style={{ width: '30px', height: '28px', background: 'none', border: 'none', cursor: 'pointer', color: '#FF7777', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>−</button>
            <span style={{ minWidth: '20px', textAlign: 'center', color: '#fff', fontWeight: 900, fontSize: '0.85rem' }}>{qtdTotal}</span>
            <button onClick={() => onAdicionar(beb, null)} style={{ width: '30px', height: '28px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>+</button>
          </div>
        )
      )}

      {temSabores && (
        <button
          onClick={() => onToggleSabor(beb.id)}
          style={{
            padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700,
            background: saborAtivo ? 'rgba(245,200,0,0.15)' : 'rgba(204,0,0,0.25)',
            border: saborAtivo ? '1px solid rgba(245,200,0,0.4)' : '1px solid rgba(204,0,0,0.5)',
            color: saborAtivo ? '#F5C800' : '#fff', cursor: 'pointer', touchAction: 'manipulation',
            marginTop: '2px',
          }}
        >
          {qtdTotal > 0 ? `${qtdTotal} add. ▾` : 'Sabor ▾'}
        </button>
      )}
    </div>
  )
}

export default function TelaUpsell({ itens, bebidas: bebidasProp, onContinuar, onPular, onAdicionar, onRemover }) {
  const bebidas = bebidasProp ?? categorias[0].itens
  const [saborAtivo, setSaborAtivo] = useState(null) // id do item com seletor aberto

  function qtdTotal(bebId) {
    return itens
      .filter(i => i.chave === `beb-${bebId}` || i.chave.startsWith(`beb-${bebId}-`))
      .reduce((acc, i) => acc + i.qtd, 0)
  }

  function qtdSabor(bebId, sabor) {
    const item = itens.find(i => i.chave === `beb-${bebId}-${sabor}`)
    return item ? item.qtd : 0
  }

  const temBebida = bebidas.some(b => qtdTotal(b.id) > 0)
  const bebSelecionada = saborAtivo ? bebidas.find(b => b.id === saborAtivo) : null

  return (
    <>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, rgba(0,0,0,0.75), rgba(26,0,0,0.65))',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.09)',
        padding: '0.9rem 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }}>Quase lá!</p>
          <h2 style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', letterSpacing: '1px', margin: '2px 0 0' }}>Quer beber algo? 🥤</h2>
        </div>
        <button onClick={onPular} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', fontWeight: 700, padding: '4px 0', touchAction: 'manipulation' }}>
          Pular
        </button>
      </div>

      {/* Banner */}
      <div style={{
        margin: '0.875rem 1rem 0.5rem', padding: '0.7rem 1rem',
        background: 'rgba(245,200,0,0.07)', border: '1px solid rgba(245,200,0,0.2)',
        borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0,
      }}>
        <span style={{ fontSize: '1.4rem' }}>🧊</span>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: 0, lineHeight: 1.4 }}>
          Bebida gelada combina com pastel fresquinho. Adicione ao pedido com <span style={{ color: '#F5C800', fontWeight: 800 }}>1 toque</span>!
        </p>
      </div>

      {/* Grid de bebidas */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0.5rem 1rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
          {bebidas.map(beb => (
            <CardBebidaUpsell
              key={beb.id}
              beb={beb}
              qtdTotal={qtdTotal(beb.id)}
              qtdSabor={(sabor) => qtdSabor(beb.id, sabor)}
              onAdicionar={onAdicionar}
              onRemover={onRemover}
              saborAtivo={saborAtivo === beb.id}
              onToggleSabor={(id) => setSaborAtivo(saborAtivo === id ? null : id)}
            />
          ))}
        </div>
      </div>

      {/* Seletor de sabores */}
      {bebSelecionada && (
        <div style={{
          padding: '0.875rem 1rem', borderTop: '1px solid rgba(255,255,255,0.09)',
          background: 'rgba(10,0,0,0.95)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.88rem' }}>{bebSelecionada.nome} — Escolha o sabor:</span>
            <button onClick={() => setSaborAtivo(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: '1rem', touchAction: 'manipulation' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {bebSelecionada.sabores.map(sabor => {
              const q = qtdSabor(bebSelecionada.id, sabor)
              const chave = `beb-${bebSelecionada.id}-${sabor}`
              const img = bebSelecionada.imagens?.[sabor] ?? bebSelecionada.imagem
              return (
                <div key={sabor} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '0.5rem 0.5rem 0.4rem', borderRadius: '12px',
                  minWidth: '68px', maxWidth: '80px',
                  background: q > 0 ? 'rgba(245,200,0,0.10)' : 'rgba(255,255,255,0.06)',
                  border: `1.5px solid ${q > 0 ? 'rgba(245,200,0,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  gap: '5px',
                }}>
                  <div style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {img
                      ? <img src={img} alt={sabor} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>🥤</span>
                    }
                  </div>
                  <span style={{ color: q > 0 ? '#F5C800' : 'rgba(255,255,255,0.85)', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, width: '100%' }}>{sabor}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    {q > 0 && (
                      <>
                        <button onClick={() => onRemover(chave)} style={{ background: 'none', border: 'none', color: '#FF7777', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 900, padding: '0 1px', touchAction: 'manipulation', lineHeight: 1 }}>−</button>
                        <span style={{ color: '#F5C800', fontWeight: 900, fontSize: '0.82rem', minWidth: '14px', textAlign: 'center' }}>{q}</span>
                      </>
                    )}
                    <button onClick={() => onAdicionar(bebSelecionada, sabor)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 900, padding: '0 1px', touchAction: 'manipulation', lineHeight: 1 }}>+</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Botão continuar */}
      <div style={{
        padding: '0.875rem 1rem', borderTop: '1px solid rgba(255,255,255,0.09)',
        background: 'rgba(0,0,0,0.35)', flexShrink: 0,
      }}>
        <button
          onClick={onContinuar}
          className={temBebida ? 'btn-brand' : 'btn-gold'}
          style={{
            width: '100%', padding: '0.95rem 1.25rem', borderRadius: '14px',
            fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0.5rem', touchAction: 'manipulation',
          }}
        >
          {temBebida ? <><span>Continuar com bebida</span><span style={{ fontSize: '1.1rem' }}>🥤</span></> : <span>Continuar sem bebida</span>}
        </button>
      </div>
    </>
  )
}
