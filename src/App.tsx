import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './styles.css'
import { VendaForm } from './VendaForm'
import { Cadastros, Estoque } from './Extras'

type Row = Record<string, any>
type Dados = Record<string, Row[]>

const fmtMoney = (c: number | undefined | null) => {
  if (c === undefined || c === null || isNaN(c)) return 'R$ 0,00'
  return `R$ ${(c / 100).toFixed(2).replace('.', ',')}`
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginErro, setLoginErro] = useState('')
  const [carregandoLogin, setCarregandoLogin] = useState(false)

  const [aba, setAba] = useState<'visao_geral' | 'venda' | 'repasses' | 'estoque' | 'cadastros'>('visao_geral')
  const [d, setD] = useState<Dados>({})
  const [erro, setErro] = useState('')

  // Estados dos expansores da tela Visão Geral
  const [mostrarMaisEdicoes, setMostrarMaisEdicoes] = useState(false)
  const [mostrarEstoqueLocal, setMostrarEstoqueLocal] = useState(false)
  const [mostrarDinheiroPessoas, setMostrarDinheiroPessoas] = useState(false)

  // Estados do Formulário de Repasse
  const [repassePessoaId, setRepassePessoaId] = useState('')
  const [repasseValor, setRepasseValor] = useState('')
  const [repasseObs, setRepasseObs] = useState('')
  const [repasseMsg, setRepasseMsg] = useState('')

  useEffect(() => {
    supabase!.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function carregar() {
    const q = async (t: string) => { 
      const r = await supabase!.from(t).select('*'); 
      if (r.error) throw r.error; 
      return r.data as Row[] 
    }
    try {
      // Tabelas do schema oficial do projeto
      const [pessoas, edicoes, locais, saldos, fin, eventos, evento_produtos, vendas, repasses] = await Promise.all([
        'pessoas', 'edicoes', 'locais', 'v_saldos', 'v_financeiro_pessoa', 'eventos', 'evento_produtos', 'vendas', 'repasses'
      ].map(q))

      // Busca opcional de itens de vendas sem travar a aplicação caso mude de nome
      let vendasItens: Row[] = []
      try {
        const resItens = await supabase!.from('vendas_itens').select('*')
        if (resItens.data) vendasItens = resItens.data
      } catch {}

      setD({ pessoas, edicoes, locais, saldos, fin, eventos, evento_produtos, vendas, repasses, vendasItens }); setErro('')
    } catch (e: any) { setErro('Erro ao carregar dados: ' + e.message) }
  }

  useEffect(() => {
    if (session) carregar()
  }, [session])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginErro('')
    setCarregandoLogin(true)

    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) setLoginErro('Falha no login: ' + error.message)
    setCarregandoLogin(false)
  }

  async function handleLogout() {
    await supabase!.auth.signOut()
    setSession(null)
  }

  async function handleSalvarRepasse(e: React.FormEvent) {
    e.preventDefault()
    if (!repassePessoaId || !repasseValor) return

    setRepasseMsg('')
    const valorCentavos = Math.round(parseFloat(repasseValor.replace(',', '.')) * 100)

    try {
      const { error } = await supabase!.from('repasses').insert({
        pessoa_id: repassePessoaId,
        valor_centavos: valorCentavos,
        obs: repasseObs || 'Repasse realizado'
      })

      if (error) {
        setErro(error.message)
      } else {
        setRepasseMsg('Repasse registrado com sucesso!')
        setRepassePessoaId('')
        setRepasseValor('')
        setRepasseObs('')
        carregar()
      }
    } catch {
      setErro('Erro ao registrar repasse.')
    }
  }

  function exportarCSV() {
    if (!d.saldos || d.saldos.length === 0) return
    let csv = 'Edicao;Local;Exemplares\n'
    d.saldos.forEach(s => {
      const ed = d.edicoes?.find(e => String(e.id) === String(s.edicao_id))?.titulo || 'Produto'
      const loc = d.locais?.find(l => String(l.id) === String(s.local_id))?.nome || 'Local'
      csv += `"${ed}";"${loc}";${s.qtd || 0}\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'estoque_por_local.csv'
    a.click()
  }

  if (!session) {
    return (
      <div style={{ padding: '60px 20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '380px', background: '#FFF', border: '2px solid #000', padding: '24px', borderRadius: '12px', boxShadow: '4px 4px 0 #000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
            <img src="/logo.png" alt="Logo" style={{ height: '32px', objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
            <h2 style={{ textAlign: 'center', margin: 0 }}>DESENCRENCA</h2>
          </div>
          <p style={{ textAlign: 'center', fontSize: '13px', color: '#666', marginBottom: '20px' }}>Acesse com e-mail e senha</p>
          
          {loginErro && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>{loginErro}</div>}

          <form onSubmit={handleLogin}>
            <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
            <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
            <button type="submit" disabled={carregandoLogin}>{carregandoLogin ? 'Entrando…' : 'Entrar'}</button>
          </form>
        </div>
      </div>
    )
  }

  if (erro) return <div style={{ padding: '20px', color: 'red' }}>{erro}</div>

  // 1. Edições Encrenca (sem proprietário individual)
  const edicoesEncrenca = d.edicoes?.filter(e => !e.proprietario_id) || []
  const idsEncrenca = edicoesEncrenca.map(e => String(e.id))

  // 2. Exemplares Totais Vendidos (Somente Encrenca)
  const exemplaresEncrencaVendidos = d.vendasItens?.filter(iv => idsEncrenca.includes(String(iv.edicao_id)))
    .reduce((acc, curr) => acc + (curr.qtd || 1), 0) || d.vendas?.reduce((acc, v) => acc + (v.qtd_itens || 1), 0) || 0

  // 3. Totais Financeiros do Coletivo
  const totalRecebidoColetivo = d.vendas?.reduce((acc, v) => acc + (v.valor_pago_centavos || 0), 0) || 0
  const pendenteClientes = d.vendas?.reduce((acc, v) => acc + Math.max(0, (v.valor_total_centavos || 0) - (v.valor_pago_centavos || 0)), 0) || 0

  // 4. Regra dos Valores Devidos a Pessoas (Consignados)
  const valoresDevidosPorPessoa: Record<string, number> = {}
  d.vendasItens?.forEach(iv => {
    const prod = d.edicoes?.find(e => String(e.id) === String(iv.edicao_id))
    if (prod && prod.proprietario_id) {
      const pId = String(prod.proprietario_id)
      const valorItem = (iv.preco_centavos || prod.preco_sugerido_centavos || 0) * (iv.qtd || 1)
      valoresDevidosPorPessoa[pId] = (valoresDevidosPorPessoa[pId] || 0) + valorItem
    }
  })

  // Subtrai repasses efetuados
  d.repasses?.forEach(r => {
    const pId = String(r.pessoa_id)
    if (valoresDevidosPorPessoa[pId]) {
      valoresDevidosPorPessoa[pId] -= (r.valor_centavos || 0)
    }
  })

  const totalValoresDevidosColetivo = Object.values(valoresDevidosPorPessoa).reduce((acc, curr) => acc + Math.max(0, curr), 0)

  return (
    <div>
      {/* Topo Roxo */}
      <header className="top-header">
        <div className="brand-logo-box">
          <img src="/logo.png" alt="Logo" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        </div>
        <div className="brand-title">DESENCRENCA</div>
        <button onClick={handleLogout} className="btn-sair">Sair</button>
      </header>

      <div className="main-wrapper">
        {/* Menu Principal */}
        <nav className="menu-tabs">
          <button onClick={() => setAba('visao_geral')} className={aba === 'visao_geral' ? 'ativo' : ''}>Visão geral</button>
          <button onClick={() => setAba('venda')} className={aba === 'venda' ? 'ativo' : ''}>Registrar venda</button>
          <button onClick={() => setAba('repasses')} className={aba === 'repasses' ? 'ativo' : ''}>Registrar repasse</button>
          <button onClick={() => setAba('estoque')} className={aba === 'estoque' ? 'ativo' : ''}>Estoque</button>
          <button onClick={() => setAba('cadastros')} className={aba === 'cadastros' ? 'ativo' : ''}>Cadastros</button>
        </nav>

        {/* VISÃO GERAL / DASHBOARD */}
        {aba === 'visao_geral' && (
          <div>
            <h2 className="panel-title">Painel de Publicações (SÓ ENCRENCA)</h2>

            <div className="cards-row">
              <div className="metric-card">
                <div className="label">Exemplares Encrenca<br/>Vendidos (Total)</div>
                <div className="value">{exemplaresEncrencaVendidos} un</div>
              </div>

              {edicoesEncrenca.slice(0, mostrarMaisEdicoes ? edicoesEncrenca.length : 3).map(e => {
                const qtd = d.vendasItens?.filter(iv => String(iv.edicao_id) === String(e.id)).reduce((acc, curr) => acc + (curr.qtd || 1), 0) || 0
                return (
                  <div key={e.id} className="metric-card">
                    <div className="label">Vendidos:<br/>{e.titulo}</div>
                    <div className="value">{qtd} un</div>
                  </div>
                )
              })}

              {edicoesEncrenca.length > 3 && (
                <button 
                  onClick={() => setMostrarMaisEdicoes(!mostrarMaisEdicoes)}
                  className="btn-action" 
                  style={{ alignSelf: 'center', margin: 0 }}
                >
                  {mostrarMaisEdicoes ? '- Ocultar edições' : '+ Ver mais edições'}
                </button>
              )}
            </div>

            <h2 className="panel-title" style={{ marginTop: '20px' }}>Fluxo Financeiro do Coletivo</h2>

            <div className="cards-row">
              <div className="metric-card">
                <div className="label">Total Recebido pelo<br/>Coletivo</div>
                <div className="value">{fmtMoney(totalRecebidoColetivo)}</div>
              </div>
              <div className="metric-card">
                <div className="label">Pendente de Clientes<br/>(A Receber)</div>
                <div className="value">{fmtMoney(pendenteClientes)}</div>
              </div>
              <div className="metric-card" style={{ border: '2px solid #E53E3E' }}>
                <div className="label">Valores Devidos a<br/>Pessoas (Consignados)</div>
                <div className="value" style={{ color: '#E53E3E' }}>{fmtMoney(totalValoresDevidosColetivo)}</div>
              </div>
              <div className="metric-card">
                <div className="label">Total de Produtos<br/>Cadastrados</div>
                <div className="value">{d.edicoes?.length || 0}</div>
              </div>
            </div>

            <div className="disclaimer">
              Métricas calculadas em tempo real com base no histórico de vendas e repasses cadastrados.
            </div>

            {/* SEÇÃO EXPANSÍVEL: ESTOQUE POR LOCAL */}
            <div style={{ marginTop: '28px', borderTop: '2px solid #000', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="panel-title" style={{ margin: 0 }}>Estoque por local (posição agora)</h3>
                <button onClick={() => setMostrarEstoqueLocal(!mostrarEstoqueLocal)} className="btn-action" style={{ margin: 0 }}>
                  {mostrarEstoqueLocal ? '- Ocultar Estoque por Local' : '+ Ver Estoque por Local'}
                </button>
              </div>

              {mostrarEstoqueLocal && (
                <div>
                  <button onClick={exportarCSV} className="btn-action" style={{ marginBottom: '12px' }}>
                    Exportar estoque (CSV)
                  </button>

                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Edição</th>
                          <th>Local</th>
                          <th>Exemplares</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.saldos?.map((s, idx) => {
                          const ed = d.edicoes?.find(e => String(e.id) === String(s.edicao_id))?.titulo || 'Produto'
                          const loc = d.locais?.find(l => String(l.id) === String(s.local_id))?.nome || 'Local'
                          return (
                            <tr key={idx}>
                              <td>{ed}</td>
                              <td>{loc}</td>
                              <td style={{ fontWeight: 'bold' }}>{s.qtd ?? 0}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO EXPANSÍVEL: DINHEIRO SOB RESPONSABILIDADE DAS PESSOAS */}
            <div style={{ marginTop: '20px', borderTop: '2px solid #000', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="panel-title" style={{ margin: 0 }}>Dinheiro sob responsabilidade das pessoas (posição agora)</h3>
                <button onClick={() => setMostrarDinheiroPessoas(!mostrarDinheiroPessoas)} className="btn-action" style={{ margin: 0 }}>
                  {mostrarDinheiroPessoas ? '- Ocultar Dinheiro sob Responsabilidade' : '+ Ver Dinheiro sob Responsabilidade'}
                </button>
              </div>

              {mostrarDinheiroPessoas && (
                <div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Pessoa</th>
                          <th>Recebido</th>
                          <th>Repassado</th>
                          <th>A repassar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.pessoas?.filter(p => p.ativa !== false).map(p => {
                          const fin = d.fin?.find(f => String(f.pessoa_id) === String(p.id))
                          const recebido = fin?.recebido_centavos ?? 0
                          const repassado = fin?.repassado_centavos ?? 0
                          const aRepassar = fin?.a_repassar_centavos ?? Math.max(0, recebido - repassado)

                          return (
                            <tr key={p.id}>
                              <td>{p.nome}</td>
                              <td>{fmtMoney(recebido)}</td>
                              <td>{fmtMoney(repassado)}</td>
                              <td style={{ fontWeight: 'bold', color: aRepassar > 0 ? '#E53E3E' : '#2F855A' }}>
                                {fmtMoney(aRepassar)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="disclaimer">Valores recebidos não são lucro nem saldo em caixa.</div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ABA REGISTRAR REPASSE */}
        {aba === 'repasses' && (
          <div>
            <h2 className="panel-title">Registrar Repasse para Pessoa Cadastrada</h2>
            {repasseMsg && <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #86EFAC' }}>{repasseMsg}</div>}

            <form onSubmit={handleSalvarRepasse}>
              <label>Pessoa beneficiária do repasse
                <select value={repassePessoaId} onChange={e => setRepassePessoaId(e.target.value)} required>
                  <option value="">Selecione a pessoa</option>
                  {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome} (Devido atual: {fmtMoney(valoresDevidosPorPessoa[String(p.id)] || 0)})
                    </option>
                  ))}
                </select>
              </label>

              <label>Valor repassado (R$)
                <input 
                  inputMode="decimal" 
                  placeholder="0,00" 
                  value={repasseValor} 
                  onChange={e => setRepasseValor(e.target.value)} 
                  required 
                />
              </label>

              <label>Observação (opcional)
                <input 
                  placeholder="Ex: Transferência via Pix realizada" 
                  value={repasseObs} 
                  onChange={e => setRepasseObs(e.target.value)} 
                />
              </label>

              <button type="submit">Salvar Repasse</button>
            </form>
          </div>
        )}

        {aba === 'venda' && <VendaForm d={d} onOk={carregar} />}
        {aba === 'estoque' && <Estoque d={d} onOk={carregar} />}
        {aba === 'cadastros' && <Cadastros d={d} onOk={carregar} />}
      </div>
    </div>
  )
}
