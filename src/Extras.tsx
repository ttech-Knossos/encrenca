import { useState } from 'react'
import { supabase } from './supabase'

type Row = Record<string, any>
type Dados = Record<string, Row[]>

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
  const [pe, setPe] = useState('')
  const [ev, setEv] = useState({ nome: '', data: '' })
  
  const [produtosEvQtd, setProdutosEvQtd] = useState<Record<string, number>>({})
  const [eventoEmEdicao, setEventoEmEdicao] = useState<string | null>(null)
  
  const [mostrarNovoProdRapido, setMostrarNovoProdRapido] = useState(false)
  const [prodRapido, setProdRapido] = useState({ titulo: '', preco: '', proprietario_id: '', is_edicao: false, qtd_inicial: '1' })

  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const cents = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100)

  async function run(fn: () => Promise<{ error: any }>, limpar: () => void) {
    setErro(''); setOk('')
    try { 
      const { error } = await fn()
      if (error) setErro(error.message)
      else { limpar(); setOk('Salvo.'); onOk() } 
    } catch { setErro('Sem conexão. Seus dados continuam no formulário.') }
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
          proprietario_id: prodRapido.proprietario_id || null,
          is_edicao: prodRapido.is_edicao
        })
        .select('id')
        .single()

      if (error) {
        setErro(error.message)
      } else if (data) {
        const q = parseInt(prodRapido.qtd_inicial) || 1
        setProdutosEvQtd(prev => ({ ...prev, [String(data.id)]: q }))
        setProdRapido({ titulo: '', preco: '', proprietario_id: '', is_edicao: false, qtd_inicial: '1' })
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

  return (
    <div>
      {erro && <div className="erro" role="alert">{erro}</div>}
      {ok && <div className="ok" role="status">{ok}</div>}
      
      <form onSubmit={novoEv} style={{ marginBottom: '30px' }}>
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

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  <input 
                    type="checkbox" 
                    checked={prodRapido.is_edicao} 
                    onChange={e => setProdRapido({ ...prodRapido, is_edicao: e.target.checked })} 
                    style={{ width: '16px', height: '16px', accentColor: '#8A41F6' }}
                  />
                  É uma edição da Encrenca? (Destacar no Painel)
                </label>

                <label style={{ fontSize: '13px' }}>
                  Estoque inicial neste evento:
                  <input 
                    type="number" 
                    min="1" 
                    value={prodRapido.qtd_inicial} 
                    onChange={e => setProdRapido({ ...prodRapido, qtd_inicial: e.target.value })} 
                  />
                </label>
                <button type="button" onClick={criarProdutoRapidoInline} style={{ background: '#38A169', color: '#FFF' }}>
                  Salvar Produto e Incluir no Evento
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
            {d.edicoes?.filter(x => x.ativa !== false).map(edItem => {
              const qtd = produtosEvQtd[String(edItem.id)]
              const selecionado = qtd !== undefined
              const dono = d.pessoas?.find(p => String(p.id) === String(edItem.proprietario_id))?.nome

              return (
                <div 
                  key={edItem.id} 
                  style={{ 
                    border: '1px solid #CBD5E0', 
                    borderRadius: '6px', 
                    padding: '8px', 
                    background: selecionado ? '#EBF8FF' : '#FFF',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <strong>{edItem.titulo}</strong>
                    <div style={{ fontSize: '11px', color: '#718096' }}>{dono ? `(${dono})` : '(Coletivo)'}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                    {!selecionado ? (
                      <button 
                        type="button" 
                        onClick={() => toggleProdutoCriacao(String(edItem.id))}
                        style={{ width: '100%', background: '#E2E8F0', border: 'none', padding: '4px', borderRadius: '4px' }}
                      >
                        + Incluir
                      </button>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button type="button" onClick={() => alterarQtdCriacao(String(edItem.id), -1)} style={{ padding: '2px 8px' }}>-</button>
                          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{qtd} un</span>
                          <button type="button" onClick={() => alterarQtdCriacao(String(edItem.id), 1)} style={{ padding: '2px 8px' }}>+</button>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => toggleProdutoCriacao(String(edItem.id))}
                          style={{ background: '#E53E3E', color: '#FFF', border: 'none', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <button>Salvar evento</button>
      </form>

      <h3>Eventos Cadastrados</h3>
      <ul style={{ listStyle: 'none', padding: 0, marginBottom: '30px' }}>
        {d.eventos?.map(x => {
          const estaEditando = eventoEmEdicao === String(x.id)
          return (
            <li key={x.id} style={{ border: '1px solid #E2E8F0', padding: '12px', marginBottom: '10px', borderRadius: '8px', background: '#FFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{x.nome}</strong> {x.data ? `— ${x.data}` : ''}
                </div>
                <button type="button" onClick={() => setEventoEmEdicao(estaEditando ? null : String(x.id))}>
                  {estaEditando ? 'Fechar Edição' : 'Editar Produtos e Estoque do Evento'}
                </button>
              </div>

              {estaEditando && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #CBD5E0' }}>
                  <p style={{ fontSize: '14px', margin: '0 0 8px 0', fontWeight: 'bold' }}>
                    Ajuste a quantidade de estoque de cada produto neste evento:
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                    {d.edicoes?.filter(e => e.ativa !== false).map(edItem => {
                      const reg = d.evento_produtos?.find(
                        ep => String(ep.evento_id) === String(x.id) && String(ep.edicao_id) === String(edItem.id)
                      )
                      const vinculado = !!reg
                      const qtdAtual = reg?.qtd_estoque ?? 0
                      const dono = d.pessoas?.find(p => String(p.id) === String(edItem.proprietario_id))?.nome

                      const atualizarEstoque = async (novaQtd: number) => {
                        setErro('')
                        try {
                          if (novaQtd <= 0) {
                            await supabase!
                              .from('evento_produtos')
                              .delete()
                              .eq('evento_id', x.id)
                              .eq('edicao_id', edItem.id)
                          } else if (vinculado) {
                            await supabase!
                              .from('evento_produtos')
                              .update({ qtd_estoque: novaQtd })
                              .eq('evento_id', x.id)
                              .eq('edicao_id', edItem.id)
                          } else {
                            await supabase!
                              .from('evento_produtos')
                              .insert({ evento_id: x.id, edicao_id: edItem.id, qtd_estoque: novaQtd })
                          }
                          onOk()
                        } catch (err: any) {
                          setErro('Erro na operação: ' + err.message)
                        }
                      }

                      return (
                        <div 
                          key={edItem.id}
                          style={{
                            border: '1px solid #CBD5E0',
                            borderRadius: '6px',
                            padding: '8px',
                            background: vinculado ? '#EBF8FF' : '#FFF',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            <strong>{edItem.titulo}</strong>
                            <div style={{ fontSize: '11px', color: '#718096' }}>{dono ? `(${dono})` : ''}</div>
                          </div>

                          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {!vinculado ? (
                              <button 
                                type="button" 
                                onClick={() => atualizarEstoque(1)}
                                style={{ width: '100%', background: '#E2E8F0', border: 'none', padding: '4px', borderRadius: '4px' }}
                              >
                                + Adicionar (1 un)
                              </button>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <button type="button" onClick={() => atualizarEstoque(qtdAtual - 1)} style={{ padding: '2px 8px' }}>-</button>
                                  <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{qtdAtual} un</span>
                                  <button type="button" onClick={() => atualizarEstoque(qtdAtual + 1)} style={{ padding: '2px 8px' }}>+</button>
                                </div>
                                <button 
                                  type="button" 
                                  onClick={() => atualizarEstoque(0)}
                                  style={{ background: '#E53E3E', color: '#FFF', border: 'none', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}
                                >
                                  Remover
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <form onSubmit={novaPe} style={{ marginBottom: '20px' }}>
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
    </div>
  )
}
