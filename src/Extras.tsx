import { useState } from 'react'
import { supabase } from './supabase'

type Row = Record<string, any>
type Dados = Record<string, Row[]>
const cents = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100)

type Campo = { k: string; label: string; v: string; tipo?: string; opcoes?: { id: string; nome: string }[] }

function EditarLinha({ campos, salvar }: { campos: Campo[]; salvar: (v: Record<string, string>) => Promise<{ error: any }> }) {
  const [aberto, setAberto] = useState(false)
  const [v, setV] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')

  if (!aberto) return <button onClick={() => { setV(Object.fromEntries(campos.map(c => [c.k, c.v]))); setAberto(true) }}>Editar</button>

  return (
    <form onSubmit={async e => { e.preventDefault(); try { const r = await salvar(v); if (r.error) setErro(r.error.message); else setAberto(false) } catch { setErro('Sem conexão.') } }}>
      {campos.map(c => (
        <label key={c.k}>
          {c.label}
          {c.tipo === 'select' ? (
            <select value={v[c.k] ?? ''} onChange={e => setV({ ...v, [c.k]: e.target.value })}>
              <option value="">Coletivo (Padrão)</option>
              {c.opcoes?.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          ) : (
            <input type={c.tipo ?? 'text'} value={v[c.k] ?? ''} onChange={e => setV({ ...v, [c.k]: e.target.value })} />
          )}
        </label>
      ))}
      {erro && <div className="erro" role="alert">{erro}</div>}
      <button>Salvar</button> <button type="button" onClick={() => setAberto(false)}>Cancelar</button>
    </form>
  )
}

export function Cadastros({ d, onOk }: { d: Dados; onOk: () => void }) {
  const [ed, setEd] = useState({ titulo: '', numero: '', preco: '', proprietario_id: '', qtd_estoque: '0' })
  const [pe, setPe] = useState('')
  const [ev, setEv] = useState({ nome: '', data: '' })
  
  const [produtosEvQtd, setProdutosEvQtd] = useState<Record<string, number>>({})
  const [eventoEmEdicao, setEventoEmEdicao] = useState<string | null>(null)
  
  const [mostrarNovoProdRapido, setMostrarNovoProdRapido] = useState(false)
  const [prodRapido, setProdRapido] = useState({ titulo: '', preco: '', proprietario_id: '', qtd_inicial: '1' })

  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  async function run(fn: () => Promise<{ error: any }>, limpar: () => void) {
    setErro(''); setOk('')
    try { 
      const { error } = await fn()
      if (error) setErro(error.message)
      else { limpar(); setOk('Salvo.'); onOk() } 
    } catch { setErro('Sem conexão. Seus dados continuam no formulário.') }
  }

  const novaEd = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await supabase!.from('edicoes').insert({
        titulo: ed.titulo,
        numero: ed.numero || null,
        preco_sugerido_centavos: ed.preco ? cents(ed.preco) : 0,
        proprietario_id: ed.proprietario_id || null
      }).select('id').single()

      if (r.error) return r

      const qtdInicial = parseInt(ed.qtd_estoque) || 0
      if (qtdInicial > 0) {
        const localCentral = d.locais?.find(l => l.tipo === 'central')?.id || d.locais?.[0]?.id
        if (localCentral) {
          await supabase!.from('movimentos').insert({
            tipo: 'entrada',
            edicao_id: r.data.id,
            destino_id: localCentral,
            qtd: qtdInicial,
            obs: 'Estoque inicial no cadastro'
          })
        }
      }

      return { error: null }
    }, () => setEd({ titulo: '', numero: '', preco: '', proprietario_id: '', qtd_estoque: '0' }))
  }

  const ajustarEstoqueProduto = async (edicaoId: string, delta: number) => {
    setErro(''); setOk('')
    try {
      const localCentral = d.locais?.find(l => l.tipo === 'central')?.id || d.locais?.[0]?.id
      if (!localCentral) return

      if (delta > 0) {
        await supabase!.from('movimentos').insert({
          tipo: 'entrada',
          edicao_id: edicaoId,
          destino_id: localCentral,
          qtd: delta,
          obs: 'Ajuste manual de estoque (+)'
        })
      } else if (delta < 0) {
        await supabase!.from('movimentos').insert({
          tipo: 'perda',
          edicao_id: edicaoId,
          origem_id: localCentral,
          qtd: Math.abs(delta),
          obs: 'Ajuste manual de estoque (-)'
        })
      }
      setOk('Estoque atualizado!')
      onOk()
    } catch (err: any) {
      setErro('Erro ao ajustar estoque: ' + err.message)
    }
  }

  const criarProdutoRapidoInline = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prodRapido.titulo) return

    try {
      const { data, error } = await supabase!
        .from('edicoes')
        .insert({
          titulo: prodRapido.titulo,
          preco_sugerido_centavos: prodRapido.preco ? cents(prodRapido.preco) : 0,
          proprietario_id: prodRapido.proprietario_id || null
        })
        .select('id')
        .single()

      if (error) {
        setErro(error.message)
      } else if (data) {
        const q = parseInt(prodRapido.qtd_inicial) || 1
        setProdutosEvQtd(prev => ({ ...prev, [String(data.id)]: q }))
        setProdRapido({ titulo: '', preco: '', proprietario_id: '', qtd_inicial: '1' })
        setMostrarNovoProdRapido(false)
        setOk('Produto criado e adicionado ao evento!')
        onOk()
      }
    } catch {
      setErro('Erro ao salvar produto.')
    }
  }

  const novaPe = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await supabase!.from('pessoas').insert({ nome: pe }).select('id').single()
      if (r.error) return r
      return supabase!.from('locais').insert({ tipo: 'pessoa', nome: pe, pessoa_id: r.data.id })
    }, () => setPe(''))
  }

  const novoEv = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await supabase!.from('eventos').insert({ nome: ev.nome, data: ev.data || null }).select('id').single()
      if (r.error) return r
      
      const eventoId = r.data.id
      await supabase!.from('locais').insert({ tipo: 'evento', nome: 'Estoque: ' + ev.nome, evento_id: eventoId })

      const entries = Object.entries(produtosEvQtd)
      if (entries.length > 0) {
        const payload = entries.map(([edicao_id, qtd_estoque]) => ({
          evento_id: eventoId,
          edicao_id,
          qtd_estoque
        }))
        await supabase!.from('evento_produtos').insert(payload)
      }

      return { error: null }
    }, () => {
      setEv({ nome: '', data: '' })
      setProdutosEvQtd({})
    })
  }

  const toggleProdutoCriacao = (edicaoId: string) => {
    const idStr = String(edicaoId)
    setProdutosEvQtd(prev => {
      const copy = { ...prev }
      if (copy[idStr] !== undefined) {
        delete copy[idStr]
      } else {
        copy[idStr] = 1
      }
      return copy
    })
  }

  const alterarQtdCriacao = (edicaoId: string, delta: number) => {
    const idStr = String(edicaoId)
    setProdutosEvQtd(prev => {
      const atual = prev[idStr] ?? 0
      const nova = atual + delta
      if (nova <= 0) {
        const copy = { ...prev }
        delete copy[idStr]
        return copy
      }
      return { ...prev, [idStr]: nova }
    })
  }

  const sv = (t: string, id: string, mk: (v: Record<string, string>) => Row, filho?: (v: Record<string, string>) => PromiseLike<{ error: any }>) => async (v: Record<string, string>) => {
    const r = await supabase!.from(t).update(mk(v)).eq('id', id)
    if (r.error) return r
    if (filho) { const r2 = await filho(v); if (r2.error) return r2 }
    onOk()
    return r
  }

  return <>
    {erro && <div className="erro" role="alert">{erro}</div>}{ok && <div className="ok" role="status">{ok}</div>}
    
    <form onSubmit={novaEd}>
      <h2>Nova edição / Produto</h2>
      <label>Título<input value={ed.titulo} onChange={e => setEd({ ...ed, titulo: e.target.value })} required /></label>
      <label>Número (opcional)<input value={ed.numero} onChange={e => setEd({ ...ed, numero: e.target.value })} /></label>
      <label>Preço sugerido (R$)<input inputMode="decimal" value={ed.preco} onChange={e => setEd({ ...ed, preco: e.target.value })} /></label>
      <label>Estoque inicial<input type="number" min="0" value={ed.qtd_estoque} onChange={e => setEd({ ...ed, qtd_estoque: e.target.value })} required /></label>
      
      <label>Proprietário do produto
        <select value={ed.proprietario_id} onChange={e => setEd({ ...ed, proprietario_id: e.target.value })}>
          <option value="">Coletivo (Produto padrão)</option>
          {d.pessoas?.filter(p => p.ativa !== false).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <button>Salvar produto</button>
    </form>

    <h3>Edições / Produtos Cadastrados</h3>
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {d.edicoes?.map(x => {
        const dono = d.pessoas?.find(p => String(p.id) === String(x.proprietario_id))?.nome
        const saldoCalculado = d.saldos?.filter(s => String(s.edicao_id) === String(x.id)).reduce((acc, curr) => acc + (curr.qtd || 0), 0) ?? 0

        return (
          <li key={x.id} style={{ border: '1px solid #CBD5E0', padding: '10px', marginBottom: '8px', borderRadius: '6px', background: '#FFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{x.titulo}</strong> {dono ? `(De: ${dono})` : '(Coletivo)'} {x.ativa === false && '(arquivada)'}
                <div style={{ fontSize: '13px', color: '#4A5568', marginTop: '4px' }}>
                  Preço: R$ {((x.preco_sugerido_centavos ?? 0) / 100).toFixed(2).replace('.', ',')}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#EDF2F7', padding: '6px 10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Estoque:</span>
                <button type="button" onClick={() => ajustarEstoqueProduto(x.id, -1)} style={{ padding: '2px 8px', fontWeight: 'bold' }}>-</button>
                <span style={{ fontSize: '15px', fontWeight: 'bold', minWidth: '30px', textAlign: 'center' }}>{saldoCalculado} un</span>
                <button type="button" onClick={() => ajustarEstoqueProduto(x.id, 1)} style={{ padding: '2px 8px', fontWeight: 'bold' }}>+</button>
              </div>
            </div>

            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
              <button onClick={() => run(async () => supabase!.from('edicoes').update({ ativa: x.ativa === false }).eq('id', x.id), () => {})}>
                {x.ativa === false ? 'Reativar' : 'Arquivar'}
              </button>
              <EditarLinha 
                campos={[
                  { k: 'titulo', label: 'Título', v: x.titulo },
                  { k: 'numero', label: 'Número', v: x.numero ?? '' },
                  { k: 'preco', label: 'Preço sugerido (R$)', v: (x.preco_sugerido_centavos / 100).toFixed(2).replace('.', ',') },
                  { k: 'proprietario_id', label: 'Proprietário', v: x.proprietario_id ?? '', tipo: 'select', opcoes: d.pessoas?.map(p => ({ id: p.id, nome: p.nome })) }
                ]} 
                salvar={sv('edicoes', x.id, v => ({
                  titulo: v.titulo,
                  numero: v.numero || null,
                  preco_sugerido_centavos: v.preco ? cents(v.preco) : 0,
                  proprietario_id: v.proprietario_id || null
                }))} 
              />
            </div>
          </li>
        )
      })}
    </ul>

    <form onSubmit={novoEv}>
      <h2>Nova feira / evento</h2>
      <label>Nome<input value={ev.nome} onChange={e => setEv({ ...ev, nome: e.target.value })} required /></label>
      <label>Data<input type="date" value={ev.data} onChange={e => setEv({ ...ev, data: e.target.value })} /></label>

      <div style={{ margin: '15px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontWeight: 'bold', margin: 0 }}>Produtos e Estoque do Evento:</label>
          <button 
            type="button" 
            onClick={() => setMostrarNovoProdRapido(!mostrarNovoProdRapido)}
            style={{ background: '#2B6CB0', color: '#FFF', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '13px' }}
          >
            {mostrarNovoProdRapido ? 'Cancelar Novo Produto' : '＋ Criar produto novo agora'}
          </button>
        </div>

        {mostrarNovoProdRapido && (
          <div style={{ background: '#F7FAFC', border: '1px solid #CBD5E0', padding: '12px', borderRadius: '6px', marginBottom: '12px' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Novo produto para o sistema</h4>
            <div style={{ display: 'grid', gap: '8px' }}>
              <input 
                placeholder="Nome/Título do produto" 
                value={prodRapido.titulo} 
                onChange={e => setProdRapido({ ...prodRapido, titulo: e.target.value })} 
                required 
              />
              <input 
                placeholder="Preço (R$)" 
                inputMode="decimal" 
                value={prodRapido.preco} 
                onChange={e => setProdRapido({ ...prodRapido, preco: e.target.value })} 
              />
              <select 
                value={prodRapido.proprietario_id} 
                onChange={e => setProdRapido({ ...prodRapido, proprietario_id: e.target.value })}
              >
                <option value="">Coletivo (Produto padrão)</option>
                {d.pessoas?.filter(p => p.ativa !== false).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <label style={{ fontSize: '13px' }}>
                Estoque inicial neste evento:
                <input 
                  type="number" 
                  min="1" 
                  value={prodRapido.qtd_inicial} 
                  onChange={e => setProdRapido({ ...prodRap
