import { useState } from 'react'
import { supabase } from './supabase'
import { useEnvio, Aviso } from './envio'

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
  const [ed, setEd] = useState({ titulo: '', numero: '', preco: '', proprietario_id: '' })
  const [pe, setPe] = useState('')
  const [ev, setEv] = useState({ nome: '', data: '' })
  const [produtosEvSelecionados, setProdutosEvSelecionados] = useState<string[]>([])
  const [eventoEmEdicao, setEventoEmEdicao] = useState<string | null>(null)
  
  const [mostrarNovoProdRapido, setMostrarNovoProdRapido] = useState(false)
  const [prodRapido, setProdRapido] = useState({ titulo: '', preco: '', proprietario_id: '' })

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
    run(async () => supabase!.from('edicoes').insert({
      titulo: ed.titulo,
      numero: ed.numero || null,
      preco_sugerido_centavos: ed.preco ? cents(ed.preco) : 0,
      proprietario_id: ed.proprietario_id || null
    }), () => setEd({ titulo: '', numero: '', preco: '', proprietario_id: '' }))
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
        setProdutosEvSelecionados(prev => [...prev, String(data.id)])
        setProdRapido({ titulo: '', preco: '', proprietario_id: '' })
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

      if (produtosEvSelecionados.length > 0) {
        const payload = produtosEvSelecionados.map(edicao_id => ({ evento_id: eventoId, edicao_id }))
        await supabase!.from('evento_produtos').insert(payload)
      }

      return { error: null }
    }, () => {
      setEv({ nome: '', data: '' })
      setProdutosEvSelecionados([])
    })
  }

  const toggleProdutoCriacao = (edicaoId: string) => {
    const idStr = String(edicaoId)
    setProdutosEvSelecionados(prev =>
      prev.includes(idStr) ? prev.filter(id => id !== idStr) : [...prev, idStr]
    )
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
        const dono = d.pessoas?.find(p => String(p.id) === String(x.proprietario_id))?.nome
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
      <h2>Nova feira / evento</h2>
      <label>Nome<input value={ev.nome} onChange={e => setEv({ ...ev, nome: e.target.value })} required /></label>
      <label>Data<input type="date" value={ev.data} onChange={e => setEv({ ...ev, data: e.target.value })} /></label>

      <div style={{ margin: '15px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontWeight: 'bold', margin: 0 }}>Produtos presentes neste evento:</label>
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
              <button type="button" onClick={criarProdutoRapidoInline} style={{ background: '#38A169', color: '#FFF' }}>
                Salvar Produto e Incluir no Evento
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {d.edicoes?.filter(x => x.ativa !== false).map(edItem => {
            const marcado = produtosEvSelecionados.includes(String(edItem.id))
            const dono = d.pessoas?.find(p => String(p.id) === String(edItem.proprietario_id))?.nome
            return (
              <button
                key={edItem.id}
                type="button"
                onClick={() => toggleProdutoCriacao(String(edItem.id))}
                style={{
                  background: marcado ? '#2B6CB0' : '#E2E8F0',
                  color: marcado ? '#FFF' : '#2D3748',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {marcado ? '✓ ' : '+ '} {edItem.titulo} {dono ? `(${dono})` : '(Coletivo)'}
              </button>
            )
          })}
        </div>
      </div>

      <button>Salvar evento</button>
    </form>

    <h3>Eventos Cadastrados</h3>
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {d.eventos?.map(x => {
        const estaEditando = eventoEmEdicao === String(x.id)
        return (
          <li key={x.id} style={{ border: '1px solid #E2E8F0', padding: '12px', marginBottom: '10px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{x.nome}</strong> {x.data ? `— ${x.data}` : ''}
              </div>
              <button type="button" onClick={() => setEventoEmEdicao(estaEditando ? null : String(x.id))}>
                {estaEditando ? 'Fechar Edição' : 'Editar Produtos do Evento'}
              </button>
            </div>

            {estaEditando && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #CBD5E0' }}>
                <p style={{ fontSize: '14px', margin: '0 0 8px 0', fontWeight: 'bold' }}>
                  Clique para adicionar (+) ou remover (✓) produtos deste evento:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {d.edicoes?.filter(e => e.ativa !== false).map(edItem => {
                    const vinculado = d.evento_produtos?.some(
                      ep => String(ep.evento_id) === String(x.id) && String(ep.edicao_id) === String(edItem.id)
                    )
                    const dono = d.pessoas?.find(p => String(p.id) === String(edItem.proprietario_id))?.nome
                    return (
                      <button
                        key={edItem.id}
                        type="button"
                        onClick={async () => {
                          if (vinculado) {
                            await supabase!
                              .from('evento_produtos')
                              .delete()
                              .eq('evento_id', x.id)
                              .eq('edicao_id', edItem.id)
                          } else {
                            await supabase!
                              .from('evento_produtos')
                              .insert({ evento_id: x.id, edicao_id: edItem.id })
                          }
                          onOk()
                        }}
                        style={{
                          background: vinculado ? '#2B6CB0' : '#EDF2F7',
                          color: vinculado ? '#FFF' : '#2D3748',
                          border: '1px solid #CBD5E0',
                          padding: '6px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        {vinculado ? '✓ ' : '+ '} {edItem.titulo} {dono ? `(${dono})` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>

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
        em_nome_de: f.em_nome_de || null,
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
