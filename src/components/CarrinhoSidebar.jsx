function ItemCarrinho({ item, onAdicionar, onRemover }) {
  const nome = item.nome || item.item?.nome || 'Item'
  const total = (item.preco * item.qtd).toFixed(2).replace('.', ',')

  return (
    <div style={{
      paddingBottom: '0.75rem',
      marginBottom: '0.75rem',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          <p style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {nome}
          </p>
          {item.sabores && item.sabores.length > 0 && (
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem', margin: '2px 0 0', lineHeight: 1.4 }}>
              Sabores: {item.sabores.join(', ')}
            </p>
          )}
          {item.adicionais && item.adicionais.length > 0 && (
            <p style={{ color: 'rgba(245,200,0,0.7)', fontSize: '0.72rem', margin: '2px 0 0', lineHeight: 1.4 }}>
              Adicionais: {item.adicionais.join(', ')}
            </p>
          )}
          <p style={{ color: '#F5C800', fontSize: '0.8rem', fontWeight: 800, margin: '4px 0 0' }}>
            R$ {total}
          </p>
        </div>

        {/* Contador +/- */}
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
              width: '28px', height: '28px', background: 'none', border: 'none',
              cursor: 'pointer', color: '#FF7777', fontSize: '1rem', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            −
          </button>
          <span style={{
            minWidth: '22px', textAlign: 'center',
            color: '#fff', fontWeight: 900, fontSize: '0.9rem',
          }}>
            {item.qtd}
          </span>
          <button
            onClick={() => onAdicionar({ ...item })}
            style={{
              width: '28px', height: '28px', background: 'none', border: 'none',
              cursor: 'pointer', color: '#fff', fontSize: '1rem', fontWeight: 900,
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

export default function CarrinhoSidebar({ itens, subtotal, onAbrir, onRemover, onAdicionar }) {
  const vazio = itens.length === 0

  return (
    <aside
      className="glass-card"
      style={{
        borderRadius: '16px',
        padding: '1.25rem',
        minHeight: '300px',
        height: 'fit-content',
        position: 'sticky',
        top: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 4px' }}>
          seu carrinho
        </p>
        <h2 style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', margin: 0, letterSpacing: '1px' }}>
          Pedido
        </h2>
      </div>

      {/* Lista */}
      {vazio ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0', color: 'rgba(255,255,255,0.55)' }}>
          <span style={{ fontSize: '2.5rem' }}>🥟</span>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', textAlign: 'center' }}>
            Seu carrinho está vazio.<br />Escolha seus pastéis!
          </p>
        </div>
      ) : (
        <>
          <div className="sidebar-items-scroll" style={{ flex: 1, overflowY: 'auto', maxHeight: '380px' }}>
            {itens.map(item => (
              <ItemCarrinho
                key={item.chave}
                item={item}
                onAdicionar={onAdicionar}
                onRemover={onRemover}
              />
            ))}
          </div>

          {/* Total */}
          <div style={{
            background: 'rgba(245,200,0,0.12)',
            border: '1px solid rgba(245,200,0,0.3)',
            borderRadius: '12px',
            padding: '0.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: '0.85rem' }}>
              Total
            </span>
            <span style={{ color: '#F5C800', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.3rem', letterSpacing: '1px' }}>
              R$ {subtotal.toFixed(2).replace('.', ',')}
            </span>
          </div>

          <button
            onClick={onAbrir}
            className="btn-brand"
            style={{ padding: '0.875rem', borderRadius: '12px', fontSize: '1rem', width: '100%' }}
          >
            Finalizar Pedido
          </button>
        </>
      )}
    </aside>
  )
}
