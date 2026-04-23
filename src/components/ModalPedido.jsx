import { useState, useEffect, useRef } from 'react'
import { CONFIG } from '../config.js'
import { apiFetch } from '../utils/apiFetch.js'
import { salvarPedido, formatarMensagemWhatsApp, enviarWhatsApp } from '../utils/salvarPedido.js'

const STEPS = ['Dados', 'Pagamento', 'Resumo']

// ── Pix EMV BR Code ──────────────────────────────────────────────
function calcCRC16(str) {
  let crc = 0xFFFF
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
      crc &= 0xFFFF
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function gerarPixPayload(chave, nome, cidade, valor) {
  const f = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`
  const merchantInfo = f('00', 'br.gov.bcb.pix') + f('01', chave)
  const additional = f('62', f('05', '***'))
  const nomeASCII = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 25)
  const cidadeASCII = (cidade || 'Cidade').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split('-')[0].trim().substring(0, 15)
  const payload =
    f('00', '01') +
    f('26', merchantInfo) +
    f('52', '0000') +
    f('53', '986') +
    (valor > 0 ? f('54', valor.toFixed(2)) : '') +
    f('58', 'BR') +
    f('59', nomeASCII || 'Loja') +
    f('60', cidadeASCII || 'Cidade') +
    additional +
    '6304'
  return payload + calcCRC16(payload)
}

function StepIndicator({ atual }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '1.5rem' }}>
      {STEPS.map((label, idx) => {
        const done = idx < atual
        const active = idx === atual
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.72rem', fontWeight: 900,
                background: done
                  ? 'linear-gradient(145deg, #6b0000, #3d0000)'
                  : active ? 'linear-gradient(145deg, #E00000, #A00000)' : 'rgba(255,255,255,0.1)',
                color: (done || active) ? '#fff' : 'rgba(255,255,255,0.4)',
                boxShadow: active ? '0 0 0 3px rgba(200,0,0,0.3)' : 'none',
                border: `1.5px solid ${done ? '#6b0000' : active ? '#FF7777' : 'rgba(255,255,255,0.3)'}`,
              }}>
                {done ? '✓' : idx + 1}
              </div>
              <span style={{ fontSize: '0.58rem', color: active ? '#FF7777' : 'rgba(255,255,255,0.5)', marginTop: '3px', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div style={{
                width: '36px', height: '2px', margin: '0 2px', marginBottom: '14px',
                background: done ? 'linear-gradient(90deg, #6b0000, #CC0000)' : 'rgba(255,255,255,0.1)',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text', required, hint }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{ display: 'block', color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
        {label} {required && <span style={{ color: '#FF7777' }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-glass"
        style={{ width: '100%', padding: '0.6rem 0.875rem', borderRadius: '10px', fontSize: '0.88rem' }}
      />
      {hint && <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', margin: '3px 0 0' }}>{hint}</p>}
    </div>
  )
}

function RadioBtn({ value, current, onChange, label, sub }) {
  const active = current === value
  return (
    <button
      onClick={() => onChange(value)}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '0.875rem 1rem', borderRadius: '12px',
        background: active ? 'rgba(200,0,0,0.2)' : 'rgba(255,255,255,0.05)',
        border: `1.5px solid ${active ? 'rgba(200,0,0,0.6)' : 'rgba(255,255,255,0.12)'}`,
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${active ? '#CC0000' : 'rgba(255,255,255,0.3)'}`,
          background: active ? '#CC0000' : 'transparent',
          boxShadow: active ? 'inset 0 0 0 3px rgba(30,0,0,0.8)' : 'none',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{label}</div>
          {sub && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.74rem' }}>{sub}</div>}
        </div>
      </div>
    </button>
  )
}

function TelaPix({ total, configLoja }) {
  const [copiado, setCopiado] = useState(false)

  const chaveRaw = configLoja?.pix_chave || CONFIG.pixChave
  const tipo     = configLoja?.pix_tipo  || CONFIG.pixTipo
  const nomeRaw  = configLoja?.pix_nome  || CONFIG.pixNome
  const cidade   = CONFIG.cidade

  let chave = chaveRaw
  if (tipo === 'Telefone') {
    const digits = (chaveRaw || '').replace(/\D/g, '')
    chave = digits.startsWith('55') ? `+${digits}` : `+55${digits}`
  } else if (tipo === 'CPF' || tipo === 'CNPJ') {
    chave = (chaveRaw || '').replace(/\D/g, '')
  }

  const pixPayload = gerarPixPayload(chave, nomeRaw, cidade, total)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=M&data=${encodeURIComponent(pixPayload)}`

  function copiar() {
    navigator.clipboard.writeText(pixPayload).catch(() => {})
    setCopiado(true)
    setTimeout(() => setCopiado(false), 3000)
  }

  if (!chaveRaw || chaveRaw === 'XXXXXXXXXXX') return null

  return (
    <div style={{
      background: 'rgba(0,180,100,0.08)', border: '1px solid rgba(0,180,100,0.3)',
      borderRadius: '16px', padding: '1.25rem', marginTop: '0.75rem',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
    }}>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', margin: 0, textAlign: 'center' }}>
        Escaneie o QR Code para pagar
      </p>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '8px', display: 'inline-block' }}>
        <img src={qrUrl} alt="QR Code Pix" width={180} height={180} style={{ display: 'block' }} />
      </div>
      <p style={{ color: '#00c878', fontWeight: 900, fontSize: '1.4rem', fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '1px', margin: 0 }}>
        R$ {total.toFixed(2).replace('.', ',')}
      </p>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', margin: 0, textAlign: 'center' }}>
        {nomeRaw} · {tipo}: {chaveRaw}
      </p>
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', padding: '0.5rem 0.75rem', width: '100%', wordBreak: 'break-all',
        fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', userSelect: 'all',
      }}>
        {pixPayload}
      </div>
      <button
        onClick={copiar}
        style={{
          width: '100%', padding: '0.6rem', borderRadius: '10px', cursor: 'pointer',
          background: copiado ? 'rgba(0,200,80,0.2)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${copiado ? 'rgba(0,200,80,0.5)' : 'rgba(255,255,255,0.15)'}`,
          color: copiado ? '#00c878' : '#fff', fontWeight: 700, fontSize: '0.85rem',
          transition: 'all 0.15s',
        }}
      >
        {copiado ? '✅ Código copiado!' : '📋 Copiar Pix copia e cola'}
      </button>
    </div>
  )
}

export default function ModalPedido({ aberto, onFechar, itens, subtotal, onLimpar, configLoja }) {
  const [step, setStep] = useState(0)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [pagamento, setPagamento] = useState('pix')
  const [troco, setTroco] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pedidoCriado, setPedidoCriado] = useState(null)
  const [erro, setErro] = useState('')
  const [tipoEntrega, setTipoEntrega] = useState('retirada')
  const [endRua, setEndRua] = useState('')
  const [endNumero, setEndNumero] = useState('')
  const [endBairro, setEndBairro] = useState('')
  const [endComplemento, setEndComplemento] = useState('')
  const [enderecosSalvos, setEnderecosSalvos] = useState([])
  const [enderecoSelecionado, setEnderecoSelecionado] = useState(-1)
  const [clienteCarregado, setClienteCarregado] = useState(false)
  const debounceRef = useRef(null)

  const enderecoPick = configLoja?.endereco_loja || ''
  const taxaEntrega = tipoEntrega === 'entrega' ? (Number(configLoja?.taxa_entrega) || 5) : 0
  const totalFinal = subtotal + taxaEntrega

  // Buscar cliente no banco quando telefone tem 10+ dígitos
  useEffect(() => {
    const tel = telefone.replace(/\D/g, '')
    if (tel.length < 10) {
      setEnderecosSalvos([])
      setEnderecoSelecionado(-1)
      setClienteCarregado(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?telefone=${tel}`)
        if (!res.ok) return
        const cliente = await res.json()
        if (cliente && cliente.nome) {
          if (!nome.trim()) setNome(cliente.nome)
          setClienteCarregado(true)
          const ends = cliente.enderecos || []
          setEnderecosSalvos(ends)
          if (ends.length > 0) {
            setEnderecoSelecionado(0)
            preencherEndereco(ends[0])
          }
        }
      } catch {}
    }, 600)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [telefone])

  function preencherEndereco(end) {
    setEndRua(end.rua || '')
    setEndNumero(end.numero || '')
    setEndBairro(end.bairro || '')
    setEndComplemento(end.complemento || '')
  }

  useEffect(() => {
    if (aberto) {
      document.body.style.overflow = 'hidden'
      setStep(0); setErro(''); setPedidoCriado(null)
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [aberto])

  if (!aberto) return null

  function validarStep() {
    if (step === 0) {
      if (!nome.trim()) { setErro('Informe seu nome.'); return false }
      if (!telefone.trim() || telefone.replace(/\D/g, '').length < 10) {
        setErro('Informe um telefone válido com DDD.'); return false
      }
      if (tipoEntrega === 'entrega') {
        if (!endRua.trim()) { setErro('Informe a rua.'); return false }
        if (!endNumero.trim()) { setErro('Informe o número.'); return false }
        if (!endBairro.trim()) { setErro('Informe o bairro.'); return false }
      }
    }
    setErro(''); return true
  }

  function avancar() {
    if (!validarStep()) return
    setStep(s => s + 1)
  }

  function voltar() {
    setErro('')
    setStep(s => s - 1)
  }

  async function confirmar() {
    setEnviando(true); setErro('')
    try {
      const itensBanco = itens.map(i => ({
        tipo: i.tipoId === 'especial' ? 'especial' : (i.sabores ? 'pastel' : 'bebida'),
        nome: i.nome,
        sabores: i.sabores || [],
        adicionais: i.adicionais || [],
        observacao: i.observacao || '',
        preco: i.preco,
        qtd: i.qtd,
      }))

      const enderecoTexto = tipoEntrega === 'entrega'
        ? `${endRua.trim()}, ${endNumero.trim()}${endComplemento.trim() ? ` - ${endComplemento.trim()}` : ''}, ${endBairro.trim()}`
        : null

      // Salvar cliente no banco (nome + endereço se entrega)
      const clientePayload = {
        telefone: telefone.replace(/\D/g, ''),
        nome: nome.trim(),
      }
      if (tipoEntrega === 'entrega' && endRua.trim()) {
        clientePayload.endereco = {
          rua: endRua.trim(), numero: endNumero.trim(),
          bairro: endBairro.trim(), complemento: endComplemento.trim(),
        }
      }
      apiFetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientePayload),
      }).catch(() => {})

      const payload = {
        nome: nome.trim(),
        telefone: telefone.replace(/\D/g, ''),
        tipo_entrega: tipoEntrega,
        endereco: enderecoTexto,
        taxa_entrega: taxaEntrega,
        pagamento,
        troco: pagamento === 'dinheiro' && troco ? parseFloat(troco) : null,
        itens: itensBanco,
        subtotal,
        total: totalFinal,
        honeypot: '',
      }

      const pedido = await salvarPedido(payload)
      setPedidoCriado(pedido)

      const msg = formatarMensagemWhatsApp({
        pedido, itens,
        nome: nome.trim(), telefone: telefone.trim(),
        pagamento, subtotal: totalFinal, troco,
        tipoEntrega, endereco: enderecoTexto, taxaEntrega,
      })
      enviarWhatsApp(msg)

      apiFetch('/api/whatsapp/enviar-confirmacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: telefone.replace(/\D/g, ''),
          numeroPedido: pedido.numero,
          nome: nome.trim(),
          itens: itensBanco,
          total: subtotal,
          pagamento,
        }),
      }).catch(() => {})
    } catch (e) {
      setErro(e.message || 'Erro ao enviar pedido.')
    } finally {
      setEnviando(false)
    }
  }

  function fecharELimpar() {
    if (pedidoCriado) onLimpar()
    onFechar()
  }

  const pixInfo = (configLoja?.pix_chave || CONFIG.pixChave) !== 'XXXXXXXXXXX'

  return (
    <>
      <div
        onClick={fecharELimpar}
        className="animate-fade-in"
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />

      <div
        className="animate-slide-up"
        style={{
          position: 'fixed', zIndex: 90,
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '95%', maxWidth: '460px',
          maxHeight: '92vh', overflowY: 'auto',
          background: 'linear-gradient(160deg, rgba(40,0,0,0.97), rgba(26,0,0,0.98))',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
        }}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(145deg, rgba(100,0,0,0.8), rgba(60,0,0,0.9))',
          padding: '1rem 1.25rem', borderRadius: '20px 20px 0 0',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>
              Finalizar Pedido
            </p>
            <h2 style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', margin: '2px 0 0', letterSpacing: '1px' }}>
              {CONFIG.nomeLoja}
            </h2>
          </div>
          <button onClick={fecharELimpar} className="btn-glass" style={{ borderRadius: '10px', width: '32px', height: '32px', fontSize: '1rem' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem' }}>

          {/* Pedido concluído */}
          {pedidoCriado ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>🥟</div>
              <h3 style={{ color: '#fff', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.6rem', letterSpacing: '1px', marginBottom: '0.5rem' }}>
                Pedido Enviado!
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                Pedido <strong style={{ color: '#F5C800' }}>#{pedidoCriado.numero}</strong> recebido com sucesso.
              </p>
              <div style={{
                background: 'rgba(245,200,0,0.1)', border: '1px solid rgba(245,200,0,0.3)',
                borderRadius: '12px', padding: '0.875rem', margin: '1rem 0',
                fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)',
              }}>
                <p style={{ margin: '0 0 4px', color: '#F5C800', fontWeight: 700 }}>🏪 Retirada na loja em {CONFIG.tempoRetirada}</p>
                {enderecoPick && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)' }}>📍 {enderecoPick}</p>
                )}
                <p style={{ margin: '4px 0 0' }}>O WhatsApp foi aberto para confirmar seu pedido.</p>
              </div>
              <a
                href={`/acompanhar?tel=${encodeURIComponent(telefone.replace(/\D/g, ''))}`}
                style={{ color: '#F5C800', fontWeight: 700, fontSize: '0.85rem', display: 'block', marginBottom: '1.25rem' }}
              >
                Acompanhar pedido ao vivo
              </a>
              <button onClick={fecharELimpar} className="btn-brand" style={{ padding: '0.75rem 2rem', borderRadius: '12px', fontSize: '0.95rem' }}>
                Fechar
              </button>
            </div>
          ) : (
            <>
              <StepIndicator atual={step} />

              {/* ── Step 0: Dados ── */}
              {step === 0 && (
                <div>
                  <InputField label="Telefone (WhatsApp)" value={telefone} onChange={setTelefone} placeholder="(32) 99999-9999" type="tel" required />
                  {clienteCarregado && (
                    <div style={{
                      margin: '-0.5rem 0 0.75rem', padding: '0.4rem 0.75rem', borderRadius: '8px',
                      background: 'rgba(0,200,80,0.1)', border: '1px solid rgba(0,200,80,0.25)',
                      fontSize: '0.75rem', color: '#6aff9e', fontWeight: 600,
                    }}>
                      ✓ Cliente reconhecido
                    </div>
                  )}
                  <InputField label="Seu nome" value={nome} onChange={setNome} placeholder="João Silva" required />

                  {/* Tipo de entrega */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {[
                      { val: 'retirada', label: '🏪 Retirada', sub: 'na loja' },
                      ...(configLoja?.entrega_ativa ? [{ val: 'entrega', label: '🛵 Entrega', sub: 'no endereço' }] : []),
                    ].map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => setTipoEntrega(opt.val)}
                        style={{
                          flex: 1, padding: '0.7rem', borderRadius: '12px', cursor: 'pointer',
                          textAlign: 'center',
                          background: tipoEntrega === opt.val ? 'rgba(200,0,0,0.2)' : 'rgba(255,255,255,0.05)',
                          border: `1.5px solid ${tipoEntrega === opt.val ? 'rgba(200,0,0,0.6)' : 'rgba(255,255,255,0.12)'}`,
                        }}
                      >
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>{opt.label}</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem' }}>{opt.sub}</div>
                      </button>
                    ))}
                  </div>

                  {tipoEntrega === 'retirada' && enderecoPick && (
                    <div style={{
                      padding: '0.75rem 1rem',
                      background: 'rgba(245,200,0,0.08)', border: '1px solid rgba(245,200,0,0.2)',
                      borderRadius: '12px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)',
                    }}>
                      <span style={{ color: '#F5C800', fontWeight: 700 }}>🏪 Retirada no local</span>
                      <br />
                      <span style={{ fontSize: '0.78rem' }}>📍 {enderecoPick}</span>
                    </div>
                  )}

                  {tipoEntrega === 'entrega' && (
                    <div style={{ marginTop: '0.25rem' }}>
                      {/* Endereços salvos */}
                      {enderecosSalvos.length > 0 && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <label style={{ display: 'block', color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px' }}>
                            Endereços salvos
                          </label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {enderecosSalvos.map((end, idx) => (
                              <button
                                key={idx}
                                onClick={() => { setEnderecoSelecionado(idx); preencherEndereco(end) }}
                                style={{
                                  width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', borderRadius: '10px', cursor: 'pointer',
                                  background: enderecoSelecionado === idx ? 'rgba(200,0,0,0.15)' : 'rgba(255,255,255,0.05)',
                                  border: `1.5px solid ${enderecoSelecionado === idx ? 'rgba(200,0,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                }}
                              >
                                <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600 }}>
                                  {end.rua}, {end.numero} {end.complemento ? `- ${end.complemento}` : ''}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem' }}>{end.bairro}</div>
                              </button>
                            ))}
                            <button
                              onClick={() => { setEnderecoSelecionado(-1); setEndRua(''); setEndNumero(''); setEndBairro(''); setEndComplemento('') }}
                              style={{
                                width: '100%', textAlign: 'center', padding: '0.5rem', borderRadius: '10px', cursor: 'pointer',
                                background: enderecoSelecionado === -1 ? 'rgba(200,0,0,0.15)' : 'rgba(255,255,255,0.05)',
                                border: `1.5px solid ${enderecoSelecionado === -1 ? 'rgba(200,0,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', fontWeight: 700,
                              }}
                            >
                              + Novo endereço
                            </button>
                          </div>
                        </div>
                      )}

                      <InputField label="Rua" value={endRua} onChange={setEndRua} placeholder="Rua das Flores" required />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <InputField label="Número" value={endNumero} onChange={setEndNumero} placeholder="123" required />
                        </div>
                        <div style={{ flex: 2 }}>
                          <InputField label="Bairro" value={endBairro} onChange={setEndBairro} placeholder="Centro" required />
                        </div>
                      </div>
                      <InputField label="Complemento" value={endComplemento} onChange={setEndComplemento} placeholder="Apto, bloco... (opcional)" />
                      {taxaEntrega > 0 && (
                        <div style={{
                          padding: '0.6rem 0.875rem', borderRadius: '10px',
                          background: 'rgba(245,200,0,0.08)', border: '1px solid rgba(245,200,0,0.2)',
                          fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)',
                        }}>
                          🛵 Taxa de entrega: <strong style={{ color: '#F5C800' }}>R$ {taxaEntrega.toFixed(2).replace('.', ',')}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 1: Pagamento ── */}
              {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  <RadioBtn value="pix" current={pagamento} onChange={setPagamento} label="Pix" sub="QR Code gerado automaticamente" />
                  <RadioBtn value="dinheiro" current={pagamento} onChange={setPagamento} label="Dinheiro" sub="Troco se necessário" />
                  <RadioBtn value="debito" current={pagamento} onChange={setPagamento} label="Cartão de Débito" sub="Na retirada" />
                  <RadioBtn value="credito" current={pagamento} onChange={setPagamento} label="Cartão de Crédito" sub="Na retirada" />

                  {pagamento === 'dinheiro' && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <InputField
                        label="Troco para quanto?"
                        value={troco}
                        onChange={setTroco}
                        placeholder={`Ex: ${Math.ceil(subtotal / 10) * 10},00`}
                        type="number"
                      />
                    </div>
                  )}

                  {pagamento === 'pix' && pixInfo && (
                    <TelaPix total={totalFinal} configLoja={configLoja} />
                  )}

                  {pagamento === 'pix' && !pixInfo && (
                    <div style={{
                      background: 'rgba(245,200,0,0.08)', border: '1px solid rgba(245,200,0,0.25)',
                      borderRadius: '12px', padding: '0.875rem', textAlign: 'center',
                    }}>
                      <p style={{ color: '#F5C800', fontSize: '0.85rem', margin: 0 }}>
                        Configure a chave Pix no painel admin para exibir o QR Code.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 2: Resumo ── */}
              {step === 2 && (
                <div>
                  <div style={{ marginBottom: '0.875rem' }}>
                    {itens.map(item => (
                      <div key={item.chave} style={{ paddingBottom: '0.5rem', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: '#fff', fontWeight: 700 }}>{item.qtd}x {item.nome}</span>
                          <span style={{ color: '#F5C800', fontWeight: 800, whiteSpace: 'nowrap' }}>
                            R$ {(item.preco * item.qtd).toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        {item.sabores?.length > 0 && (
                          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', margin: '2px 0 0' }}>
                            Sabores: {item.sabores.join(', ')}
                          </p>
                        )}
                        {item.adicionais?.length > 0 && (
                          <p style={{ color: 'rgba(245,200,0,0.65)', fontSize: '0.72rem', margin: '2px 0 0' }}>
                            Adicionais: {item.adicionais.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Subtotal + Taxa */}
                  <div style={{ paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.15)', marginBottom: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: 'rgba(255,255,255,0.6)' }}>
                      <span>Subtotal</span>
                      <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    {taxaEntrega > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginTop: '3px' }}>
                        <span>🛵 Taxa de entrega</span>
                        <span>R$ {taxaEntrega.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1.05rem', marginTop: '6px' }}>
                      <span style={{ color: 'rgba(255,255,255,0.8)' }}>TOTAL</span>
                      <span style={{ color: '#F5C800', fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.4rem' }}>
                        R$ {totalFinal.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>

                  {/* Dados do pedido */}
                  <div style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '0.875rem', fontSize: '0.8rem',
                    color: 'rgba(255,255,255,0.65)', display: 'flex', flexDirection: 'column', gap: '5px',
                    marginBottom: '0.75rem',
                  }}>
                    <div><strong style={{ color: '#fff' }}>Cliente:</strong> {nome}</div>
                    <div><strong style={{ color: '#fff' }}>Tel:</strong> {telefone}</div>
                    {tipoEntrega === 'retirada' ? (
                      <>
                        <div><strong style={{ color: '#fff' }}>Retirada:</strong> na loja — {CONFIG.tempoRetirada}</div>
                        {enderecoPick && <div style={{ fontSize: '0.75rem' }}>📍 {enderecoPick}</div>}
                      </>
                    ) : (
                      <div><strong style={{ color: '#fff' }}>🛵 Entrega:</strong> {endRua}, {endNumero}{endComplemento ? ` - ${endComplemento}` : ''}, {endBairro}</div>
                    )}
                    <div><strong style={{ color: '#fff' }}>Pagamento:</strong> {pagamento.toUpperCase()}{pagamento === 'dinheiro' && troco ? ` (troco p/ R$ ${troco})` : ''}</div>
                  </div>

                  {pagamento === 'pix' && pixInfo && (
                    <TelaPix total={totalFinal} configLoja={configLoja} />
                  )}
                </div>
              )}

              {/* Erro */}
              {erro && (
                <div style={{
                  marginTop: '0.875rem', padding: '0.7rem 0.875rem',
                  background: 'rgba(200,0,0,0.15)', border: '1px solid rgba(200,0,0,0.5)',
                  borderRadius: '10px', color: '#ff6666', fontSize: '0.82rem', fontWeight: 700,
                }}>
                  {erro}
                </div>
              )}

              {/* Navegação */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                {step > 0 && (
                  <button onClick={voltar} className="btn-glass" style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', fontSize: '0.9rem' }}>
                    Voltar
                  </button>
                )}
                {step < STEPS.length - 1 ? (
                  <button onClick={avancar} className="btn-brand" style={{ flex: 2, padding: '0.75rem', borderRadius: '12px', fontSize: '0.95rem' }}>
                    Continuar
                  </button>
                ) : (
                  <button
                    onClick={confirmar}
                    disabled={enviando}
                    className="btn-gold"
                    style={{ flex: 2, padding: '0.75rem', borderRadius: '12px', fontSize: '0.95rem', opacity: enviando ? 0.6 : 1 }}
                  >
                    {enviando ? 'Enviando...' : 'Confirmar Pedido'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
