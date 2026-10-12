import { useState } from 'react'
import { supabase } from './supabase'
import { useEnvio, Aviso } from './envio'

type Row = Record<string, any>; 
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
  const [ed, setEd] = useState({ titulo: '', numero: '', preco: '', proprietario_id: '' })
  const [pe, setPe] = useState('')
  const [ev, setEv] = useState({ nome: '', data: '' })
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

  // Regra 5: Inclui o proprietario_id no cadastro da edição/produto
  const novaEd = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => supabase!.from('edicoes').insert({
      titulo: ed.titulo,
      numero: ed.numero || null,
      preco_sugerido_centavos: ed.preco ? cents(ed.preco) : 0,
      proprietario_id: ed.proprietario_id || null
    }), () => setEd({ titulo: '', numero: '', preco: '', proprietario_id: '' }))
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
      return supabase!.from('locais').insert({ tipo: 'evento', nome: 'Estoque: ' + ev.nome, evento_id: r.data.id })
    }, () => setEv({ nome: '', data: '' }))
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
      
      {/* Regra 5: Selecionar se o produto é do coletivo ou de uma pessoa */}
      <label>Proprietário do produto
        <select value={ed.proprietario_id} onChange={e => setEd({ ...ed, proprietario_id: e.target.value })}>
          <option value="">Coletivo (Produto padrão)</option>
          {d.pessoas?.filter(p => p.ativa !== false).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <button>Salvar produto</button>
    </form>

    <h3>Edições / Produtos</h3>
    <ul>
      {d.edicoes?.map(x => {
        const dono = d.pessoas?.find(p => p.id === x.proprietario_id)?.nome
        return (
          <li key={x.id}>
            {x.titulo} {dono ? `(De: ${dono})` : '(Coletivo)'} {x.ativa === false && '(arquivada)'}{' '}
            <button onClick={() => run(async () => supabase!.from('edicoes').update({ ativa: x.ativa === false }).eq('id', x.id), () => {})}>
              {x.ativa === false ? 'Reativar' : 'Arquivar'}
            </button>{' '}
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
          </li>
        )
      })}
    </ul>

    <form onSubmit={novoEv}>
      <h2>Nova feira/evento</h2>
      <label>Nome<input value={ev.nome} onChange={e => setEv({ ...ev, nome: e.target.value })} required /></label>
      <label>Data<input type="date" value={ev.data} onChange={e => setEv({ ...ev, data: e.target.value })} /></label>
      <button>Salvar evento</button>
    </form>

    <form onSubmit={novaPe}>
      <h2>Nova pessoa</h2>
      <label>Nome<input value={pe} onChange={e => setPe(e.target.value)} required /></label>
      <button>Salvar pessoa</button>
    </form>

    <h3>Pessoas</h3>
    <ul>
      {d.pessoas?.map(x => (
        <li key={x.id}>
          {x.nome} {!x.ativa && '(inativa)'}{' '}
          <button onClick={() => run(async () => supabase!.from('pessoas').update({ ativa: !x.ativa }).eq('id', x.id), () => {})}>
            {x.ativa ? 'Desativar' : 'Reativar'}
          </button>{' '}
          <EditarLinha campos={[{ k: 'nome', label: 'Nome', v: x.nome }]} salvar={sv('pessoas', x.id, v => ({ nome: v.nome }), v => supabase!.from('locais').update({ nome: v.nome }).eq('pessoa_id', x.id))} />
        </li>
      ))}
    </ul>

    <h3>Eventos</h3>
    <ul>
      {d.eventos?.map(x => (
        <li key={x.id}>
          {x.nome} {x.data ?? ''}{' '}
          <EditarLinha campos={[{ k: 'nome', label: 'Nome', v: x.nome }, { k: 'data', label: 'Data', v: x.data ?? '', tipo: 'date' }]} salvar={sv('eventos', x.id, v => ({ nome: v.nome, data: v.data || null }), v => supabase!.from('locais').update({ nome: 'Estoque: ' + v.nome }).eq('evento_id', x.id))} />
        </li>
      ))}
    </ul>
  </>
}

const TIPOS: Record<string, [string, boolean, boolean]> = {
  saldo_inicial: ['Estoque inicial', false, true],
  entrada: ['Nova entrada/reimpressão', false, true],
  distribuicao: ['Distribuir', true, true],
  transferencia: ['Transferir', true, true],
  devolucao: ['Devolver ao central', true, true],
  cortesia: ['Cortesia', true, false],
  perda: ['Perda', true, false]
}

export function Estoque({ d, onOk }: { d: Dados; onOk: () => void }) {
  const vazio = { tipo: 'distribuicao', ed: '', o: '', d: '', q: '', em_nome_de: '', obs: '' }
  const [f, setF] = useState(vazio)
  const { msg, erro, env, enviar, incerto, descartar } = useEnvio(onOk)

  const [, pO, pD] = TIPOS[f.tipo]
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value })
  const locais = (v: string, k: string) => (
    <label>{k}
      <select value={v} onChange={set(k === 'Sai de' ? 'o' : 'd')} required>
        <option value="">Selecione</option>
        {d.locais?.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
    </label>
  )

  return (
    <form onSubmit={e => {
      e.preventDefault();
      enviar('mover_estoque', {
        tipo: f.tipo,
        edicao_id: f.ed,
        origem_id: pO ? f.o : '',
        destino_id: pD ? f.d : '',
        qtd: +f.q,
        em_nome_de: f.em_nome_de || null, // Regra 1: Passa a pessoa recebedora da cortesia
        obs: f.obs
      }).then(ok => ok && setF(vazio))
    }}>
      <h2>Movimentar estoque</h2>
      <label>O que aconteceu
        <select value={f.tipo} onChange={set('tipo')}>
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
        </select>
      </label>

      <label>Edição / Produto
        <select value={f.ed} onChange={set('ed')} required>
          <option value="">Selecione</option>
          {d.edicoes?.filter(x => x.ativa !== false).map(x => <option key={x.id} value={x.id}>{x.titulo}</option>)}
        </select>
      </label>

      {pO && locais(f.o, 'Sai de')}
      {pD && locais(f.d, 'Vai para')}

      {/* Regra 1: Selecionar quem recebeu se o tipo for Cortesia */}
      {f.tipo === 'cortesia' && (
        <label>Cortesia para quem?
          <select value={f.em_nome_de} onChange={set('em_nome_de')} required>
            <option value="">Selecione a pessoa</option>
            {d.pessoas?.filter(p => p.ativa !== false).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      )}

      <label>Quantidade<input inputMode="numeric" value={f.q} onChange={set('q')} required /></label>
      <details><summary>Observação (opcional)</summary><input value={f.obs} onChange={set('obs')} /></details>
      
      <Aviso erro={erro} incerto={incerto} descartar={descartar} />
      {msg && <div className="ok" role="status">{msg}</div>}
      <button disabled={env}>{env ? 'Salvando…' : 'Salvar'}</button>
    </form>
  )
}
