function ItemCarrinho({ item, onAdicionar, onRemover }) {
  const nome = item.nome || item.item?.nome || 'Item'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start',
      padding: '0.875rem 1rem',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      gap: '0.75rem',
    }}>
      <div style={{
        width: '64px', height: '64px', flexShrink: 0,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2rem',
      }}>
        {item.tipoId === 'bebida' ? '🥤' : item.tipoId === 'especial' ? '⭐' : '🥟'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.92rem', margin: 0, lineHeight: 1.3 }}>{nome}</p>
        {item.sabores?.length > 0 && (
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', margin: '2px 0 0', lineHeight: 1.4 }}>
            {item.sabores.join(', ')}
          </p>
        )}
        {item.adicionais?.length > 0 && (
          <p style={{ color: 'rgba(245,200,0,0.7)', fontSize: '0.72rem', margin: '2px 0 0' }}>
            + {item.adicionais.join(', ')}
          </p>
        )}
        {item.observacao && (
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem', margin: '2px 0 0', fontStyle: 'italic' }}>
            {item.observacao}
          </p>
        )}
        <p style={{ color: '#F5C800', fontWeight: 900, fontSize: '0.92rem', margin: '5px 0 0' }}>
          R$ {(item.preco * item.qtd).toFixed(2).replace('.', ',')}
        </p>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '10px', overflow: 'hidden', flexShrink: 0,
      }}>
        <button
          onClick={() => onRemover(item.chave)}
          style={{ width: '36px', height: '36px', background: 'none', border: 'none', cursor: 'pointer', color: '#FF7777', fontSize: '1.15rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
        >−</button>
        <span style={{ minWidth: '28px', textAlign: 'center', color: '#fff', fontWeight: 900, fontSize: '0.95rem' }}>
          {item.qtd}
        </span>
        <button
          onClick={() => onAdicionar({ ...item })}
          style={{ width: '36px', height: '36px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '1.15rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
        >+</button>
      </div>
    </div>
  )
}

export default function TelaCarrinho({ itens, subtotal, onVoltar, onFinalizar, onRemover, onAdicionar, onLimpar }) {
  const vazio = itens.length === 0

  return (
    <>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, rgba(0,0,0,0.75), rgba(26,0,0,0.65))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.09)',
        padding: '0.8rem 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <button
          onClick={onVoltar}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', fontWeight: 800, padding: '4px 0', touchAction: 'manipulation' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Carrinho
        </button>

        {!vazio && (
          <button
            onClick={onLimpar}
            style={{
              background: 'rgba(200,0,0,0.15)', border: '1px solid rgba(200,0,0,0.3)',
              borderRadius: '8px', padding: '5px 12px', cursor: 'pointer',
              color: '#ff7777', fontSize: '0.8rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '5px',
              touchAction: 'manipulation',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
            </svg>
            Limpar
          </button>
        )}
      </div>

      {/* Lista de itens */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {vazio ? (
          <div style={{ textAlign: 'center', paddingTop: '5rem', color: 'rgba(255,255,255,0.55)' }}>
            <div style={{ fontSize: '4rem' }}>🥟</div>
            <p style={{ marginTop: '1rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
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

      {/* Rodapé: botão finalizar */}
      {!vazio && (
        <div style={{
          padding: '0.875rem 1rem',
          borderTop: '1px solid rgba(255,255,255,0.09)',
          background: 'rgba(0,0,0,0.35)',
          flexShrink: 0,
        }}>
          <button
            onClick={onFinalizar}
            className="btn-brand"
            style={{
              width: '100%', padding: '0.95rem 1.25rem', borderRadius: '14px',
              fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              touchAction: 'manipulation',
            }}
          >
            <span>Finalizar Pedido</span>
            <span style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '3px 12px', fontSize: '1rem' }}>
              R$ {subtotal.toFixed(2).replace('.', ',')}
            </span>
          </button>
        </div>
      )}
    </>
  )
}
