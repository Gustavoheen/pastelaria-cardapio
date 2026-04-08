import { useEffect } from 'react'

function ItemCarrinho({ item, onAdicionar, onRemover }) {
  const nome = item.nome || item.item?.nome || 'Item'

  return (
    <div style={{
      paddingBottom: '0.875rem',
      marginBottom: '0.875rem',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <p style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {nome}
          </p>
          {item.sabores && item.sabores.length > 0 && (
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', margin: '2px 0 0', lineHeight: 1.4 }}>
              Sabores: {item.sabores.join(', ')}
            </p>
          )}
          {item.adicionais && item.adicionais.length > 0 && (
            <p style={{ color: 'rgba(245,200,0,0.75)', fontSize: '0.75rem', margin: '2px 0 0', lineHeight: 1.4 }}>
              Adicionais: {item.adicionais.join(', ')}
            </p>
          )}
          {item.observacao && (
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem', margin: '2px 0 0', fontStyle: 'italic' }}>
              {item.observacao}
            </p>
          )}
          <p style={{ color: '#F5C800', fontSize: '0.85rem', fontWeight: 800, margin: '4px 0 0' }}>
            R$ {(item.preco * item.qtd).toFixed(2).replace('.', ',')}
          </p>
        </div>

        {/* Contador */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '10px',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <button
            onClick={() => onRemover(item.chave)}
            style={{
              width: '32px', height: '32px', background: 'none', border: 'none',
              cursor: 'pointer', color: '#FF7777', fontSize: '1.1rem', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            −
          </button>
          <span style={{
            minWidth: '24px', textAlign: 'center',
            color: '#fff', fontWeight: 900, fontSize: '1rem',
          }}>
            {item.qtd}
          </span>
          <button
            onClick={() => onAdicionar({ ...item })}
            style={{
              width: '32px', height: '32px', background: 'none', border: 'none',
              cursor: 'pointer', color: '#fff', fontSize: '1.1rem', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DrawerCarrinho({ aberto, onFechar, itens, subtotal, onAbrir, onRemover, onAdicionar }) {
  useEffect(() => {
    if (aberto) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [aberto])

  if (!aberto) return null

  const vazio = itens.length === 0

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onFechar}
        className="animate-fade-in"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 50,
        }}
      />

      {/* Drawer */}
      <div
        className="animate-slide-right"
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0,
          width: '100%', maxWidth: '380px',
          zIndex: 60,
          background: 'linear-gradient(160deg, rgba(30,0,0,0.97), rgba(20,0,0,0.98))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(145deg, rgba(100,0,0,0.6), rgba(50,0,0,0.8))',
          padding: '1.1rem 1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>
              seu carrinho
            </p>
            <h2 style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', margin: '2px 0 0', letterSpacing: '1px' }}>
              Pedido
            </h2>
          </div>
          <button
            onClick={onFechar}
            className="btn-glass"
            style={{ borderRadius: '10px', width: '36px', height: '36px', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>

        {/* Itens */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.1rem 1.25rem' }}>
          {vazio ? (
            <div style={{ textAlign: 'center', paddingTop: '3rem', color: 'rgba(255,255,255,0.55)' }}>
              <div style={{ fontSize: '3rem' }}>🥟</div>
              <p style={{ marginTop: '1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Seu carrinho está vazio.<br />Escolha seus pastéis!
              </p>
            </div>
          ) : (
            itens.map(item => (
              <ItemCarrinho
                key={item.chave}
                item={item}
                onAdicionar={onAdicionar}
                onRemover={onRemover}
              />
            ))
          )}
        </div>

        {/* Rodapé */}
        {!vazio && (
          <div style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(245,200,0,0.1)',
              border: '1px solid rgba(245,200,0,0.3)',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>Total</span>
              <span style={{ color: '#F5C800', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.4rem', letterSpacing: '1px' }}>
                R$ {subtotal.toFixed(2).replace('.', ',')}
              </span>
            </div>

            <button
              onClick={() => { onFechar(); onAbrir() }}
              className="btn-brand"
              style={{ padding: '1rem', borderRadius: '14px', fontSize: '1rem', width: '100%' }}
            >
              Finalizar Pedido
            </button>
          </div>
        )}
      </div>
    </>
  )
}
