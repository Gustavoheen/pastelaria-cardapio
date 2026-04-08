export default function CardPastel({ tipo, onPersonalizar, qtdNoCarrinho }) {
  return (
    <div className="card-pastel-item">
      {/* Imagem */}
      <div className="cp-right">
        <div className="cp-img-inner" style={{
          border: qtdNoCarrinho > 0 ? '1.5px solid rgba(245,200,0,0.4)' : '1px solid rgba(255,255,255,0.09)',
        }}>
          {tipo.tipo === 'doce' ? '🫓' : '🥟'}
          {qtdNoCarrinho > 0 && (
            <span style={{
              position: 'absolute', top: '-7px', right: '-7px',
              background: 'linear-gradient(145deg, #F5C800, #c9a200)',
              color: '#1a0000', borderRadius: '50%',
              width: '22px', height: '22px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', fontWeight: 900,
              boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
            }}>
              {qtdNoCarrinho}
            </span>
          )}
        </div>
        <button
          onClick={() => onPersonalizar(tipo)}
          className="btn-brand cp-btn"
          style={{ touchAction: 'manipulation' }}
        >
          + Pedir
        </button>
      </div>

      {/* Texto */}
      <div className="cp-text">
        <h3 className="cp-nome">{tipo.nome}</h3>
        <p className="cp-sub">{tipo.subtitulo}</p>
        <p className="cp-preco">R$ {tipo.preco.toFixed(2).replace('.', ',')}</p>
      </div>
    </div>
  )
}
