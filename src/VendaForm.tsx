import { useState } from 'react'
import { useEnvio, Aviso } from './envio'

type Row = Record<string, any>
type Dados = Record<string, Row[]>

const cents = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100)
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

export function VendaForm({ d, onOk }: { d: Dados; onOk: () => void }) {
  const [eventoId, setEventoId] = useState('')
  const [carrinho, setCarrinho] = useState<Record<string, number>>({})
  const [descontoStr, setDescontoStr] = useState('')
  const [meio, setMeio] = useState('pix')
  const [destino, setDestino] = useState('coletivo')
  const { msg, erro, env, enviar, incerto, descartar } = useEnvio(onOk)

  // Filtra produtos vinculados ao evento ou mostra todos se nenhum evento for selecionado
  const edicoesExibidas = eventoId
    ? d.edicoes?.filter(ed => d.evento_produtos?.some(ep => ep.evento_id === eventoId && ep.edicao_id === ed.id))
    : d.edicoes?.filter(x => x.ativa !== false)

  const alterarQtd = (edicaoId: string, delta: number) => {
    setCarrinho(prev => {
      const q = (prev[edicaoId] || 0) + delta
      if (q <= 0) {
        const copy = { ...prev }
        delete copy[edicaoId]
        return copy
      }
      return { ...prev, [edicaoId]: q }
    })
  }

  // Cálculo automático do subtotal bruto
  const subtotalCentavos = Object.entries(carrinho).reduce((acc, [edId, qtd]) => {
    const ed = d.edicoes?.find(e => e.id === edId)
    return acc + (ed?.preco_sugerido_centavos ?? 0) * qtd
  }, 0)

  const descontoCentavos = descontoStr ? cents(descontoStr) : 0
  const totalCentavos = Math.max(0, subtotalCentavos - descontoCentavos)

  function submit(e: React.FormEvent) {
    e.preventDefault()

    const itensEnvio = Object.entries(carrinho).map(([edId, qtd]) => {
      const ed = d.edicoes?.find(e => e.id === edId)
      // Tenta achar local do evento ou central
      const orig = d.locais?.find(l => l.evento_id === eventoId)?.id ?? d.locais?.find(l => l.tipo === 'central')?.id ?? d.locais?.[0]?.id ?? ''
      return {
        edicao_id: edId,
        origem_id: orig,
        qtd,
        preco_centavos: ed?.preco_sugerido_centavos ?? 0,
        desconto_centavos: 0
      }
    })

    if (itensEnvio.length === 0) {
      alert('Selecione ao menos um produto para a venda.')
      return
    }

    const respPadrao = d.pessoas?.find(p => p.ativa)?.id || ''

    enviar('registrar_venda', {
      responsavel_id: respPadrao,
      em_nome_de: respPadrao,
      canal: eventoId ? 'evento' : 'feira',
      data: hoje(),
      evento_id: eventoId || null,
      obs: '',
      itens: itensEnvio,
      frete_cobrado_centavos: 0,
      frete_custo_centavos: null,
      frete_pago_por: null,
      recebimentos: [
        {
          valor_centavos: totalCentavos,
          meio,
          data: hoje(),
          destino: destino === 'coletivo' ? 'coletivo' : 'pessoa',
          pessoa_id: destino === 'coletivo' ? null : destino
        }
      ]
    }).then(ok => {
      if (ok) {
        setCarrinho({})
        setDescontoStr('')
      }
    })
  }

  return (
    <form onSubmit={submit}>
      <h2>Registrar venda</h2>

      {/* 1. Selecionar o Evento */}
      <label>
        Evento
        <select value={eventoId} onChange={e => { setEventoId(e.target.value); setCarrinho({}); }}>
          <option value="">Selecione o Evento (ou Venda Geral)</option>
          {d.eventos?.map(x => (
            <option key={x.id} value={x.id}>{x.nome}</option>
          ))}
        </select>
      </label>

      {/* 2. Lista de Produtos com + e - */}
      <h3>Produtos</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px', margin: '10px 0' }}>
        {edicoesExibidas?.map(ed => {
          const qtd = carrinho[ed.id] || 0
          const dono = d.pessoas?.find(p => p.id === ed.proprietario_id)?.nome
          return (
            <div key={ed.id} style={{ border: '1px solid #CBD5E0', padding: '10px', borderRadius: '8px', background: qtd > 0 ? '#F0FFF4' : '#FFF' }}>
              <strong>{ed.titulo}</strong>
              <div style={{ fontSize: '12px', color: '#718096' }}>{dono ? `Produto de: ${dono}` : 'Produto do Coletivo'}</div>
              <div style={{ fontWeight: 'bold', margin: '4px 0' }}>R$ {((ed.preco_sugerido_centavos ?? 0) / 100).toFixed(2).replace('.', ',')}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                <button type="button" onClick={() => alterarQtd(ed.id, -1)} disabled={qtd === 0} style={{ width: '36px', height: '36px', fontSize: '18px' }}>-</button>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{qtd}</span>
                <button type="button" onClick={() => alterarQtd(ed.id, 1)} style={{ width: '36px', height: '36px', fontSize: '18px' }}>+</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 3. Desconto e Valor Total Calculado */}
      <label>
        Desconto (R$, opcional)
        <input inputMode="decimal" value={descontoStr} onChange={e => setDescontoStr(e.target.value)} placeholder="0,00" />
      </label>

      <div style={{ background: '#EDF2F7', padding: '12px', borderRadius: '8px', margin: '15px 0' }}>
        <h3 style={{ margin: 0 }}>Valor Total: R$ {(totalCentavos / 100).toFixed(2).replace('.', ',')}</h3>
      </div>

      {/* 4. Forma de Pagamento e Destino */}
      <label>
        Forma de pagamento
        <select value={meio} onChange={e => setMeio(e.target.value)}>
          <option value="pix">Pix</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="cartao">Cartão</option>
          <option value="transferencia">Transferência</option>
        </select>
      </label>

      <label>
        Quem recebeu
        <select value={destino} onChange={e => setDestino(e.target.value)}>
          <option value="coletivo">Coletivo</option>
          {d.pessoas?.map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </label>

      <Aviso erro={erro} incerto={incerto} descartar={descartar} />
      {msg && <div className="ok" role="status">{msg}</div>}
      
      {/* 5. Salvar Venda */}
      <button disabled={env} style={{ width: '100%', padding: '12px', marginTop: '10px', fontSize: '16px' }}>
        {env ? 'Salvando…' : 'Salvar Venda'}
      </button>
    </form>
  )
}
