import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './styles.css'
import { VendaForm } from './VendaForm'
import { Cadastros } from './Extras'

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

  // Expansores da tela Visão Geral
  const [mostrarMaisEdicoes, setMostrarMaisEdicoes] = useState(false)
  const [mostrarEstoqueProduto, setMostrarEstoqueProduto] = useState(false)
  const [mostrarDinheiroPessoas, setMostrarDinheiroPessoas] = useState(false)

  // Filtro da Tela de Estoque
  const [filtroEstoqueDono, setFiltroEstoqueDono] = useState<string>('todos')

  // Formulário de Repasse
  const [repassePessoaId, setRepassePessoaId] = useState('')
  const [repasseValor, setRepasseValor] = useState('')
  const [repasseObs, setRepasseObs] = useState('')
  const [repasseMsg, setRepasseMsg] = useState('')

  // Formulário de Cadastro Rápido de Produto na aba Estoque
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoPreco, setNovoPreco] = useState('')
  const [novoDonoId, setNovoDonoId] = useState('')
  const [novoEstoqueQtd, setNovoEstoqueQtd] = useState('')
  const [estoqueMsg, setEstoqueMsg] = useState('')

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
      const [pessoas, edicoes, locais, saldos, fin, eventos, evento_produtos, vendas, repasses] = await Promise.all([
        'pessoas', 'edicoes', 'locais', 'v_saldos', 'v_financeiro_pessoa', 'eventos', 'evento_produtos', 'vendas', 'repasses'
      ].map(q))

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

  function irParaEstoqueComFiltro(donoId: string) {
    setFiltroEstoqueDono(donoId)
    setAba('estoque')
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

  async function handleCadastrarProdutoEstoque(e: React.FormEvent) {
    e.preventDefault()
    if (!novoTitulo) return
    setEstoqueMsg('')

    try {
      const precoCentavos = novoPreco ? Math.round(parseFloat(novoPreco.replace(',', '.')) * 100) : 0
      const { data: prodData, error: prodErr } = await supabase!.from('edicoes').insert({
        titulo: novoTitulo,
        preco_sugerido_centavos: precoCentavos,
        proprietario_id: novoDonoId || null
      }).select().single()

      if (prodErr) throw prodErr

      const qtd = parseInt(novoEstoqueQtd) || 0
      const localPadrao = d.locais?.[0]?.id

      if (qtd > 0 && localPadrao && prodData) {
        await supabase!.from('saldos_estoque').insert({
          edicao_id: prodData.id,
          local_id: localPadrao,
          qtd: qtd
        })
      }

      setEstoqueMsg('Produto cadastrado com sucesso!')
      setNovoTitulo('')
      setNovoPreco('')
      setNovoDonoId('')
      setNovoEstoqueQtd('')
      carregar()
    } catch (e: any) {
      setEstoqueMsg('Erro ao cadastrar produto: ' + e.message)
    }
  }

  async function handleAjustarEstoque(edicaoId: string, localId: string, delta: number) {
    try {
      const saldoAtual = d.saldos?.find(s => String(s.edicao_id) === String(edicaoId) && String(s.local_id) === String(localId))
      const novaQtd = (saldoAtual?.qtd || 0) + delta

      if (saldoAtual?.id) {
        await supabase!.from('saldos_estoque').update({ qtd: Math.max(0, novaQtd) }).eq('id', saldoAtual.id)
      } else {
        await supabase!.from('saldos_estoque').insert({ edicao_id: edicaoId, local_id: localId, qtd: Math.max(0, delta) })
      }
      carregar()
    } catch (e: any) {
      alert('Erro ao atualizar estoque: ' + e.message)
    }
  }

  function exportarCSV() {
    if (!d.edicoes || d.edicoes.length === 0) return
    let csv = 'Produto/Edição;Responsável;Estoque Total\n'
    d.edicoes.forEach(e => {
      const dono = d.pessoas?.find(p => String(p.id) === String(e.proprietario_id))?.nome || 'Coletivo (Encrenca)'
      const totalEstoque = d.saldos?.filter(s => String(s.edicao_id) === String(e.id)).reduce((acc, curr) => acc + (curr.qtd || 0), 0) || 0
      csv += `"${e.titulo}";"${dono}";${totalEstoque}\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'estoque_por_produto.csv'
    a.click()
  }

  if (!session) {
    return (
      <div style={{ padding: '60px 20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '380px', background: '#FFF', border: '2px solid #000', padding: '24px', borderRadius: '12px', boxShadow: '4px 4px 0 #000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
            <img 
              src="/logo.png" 
              alt="Logo" 
              style={{ height: '36px', objectFit: 'contain' }} 
              onError={(e) => {
                if (e.currentTarget.src.includes('/logo.png')) {
                  e.currentTarget.src = 'logo.png'
                } else {
                  e.currentTarget.style.display = 'none'
                }
              }} 
            />
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

  // 1. Edições Encrenca e de Pessoas
  const edicoesEncrenca = d.edicoes?.filter(e => !e.proprietario_id) || []
  const edicoesPessoas = d.edicoes?.filter(e => !!e.proprietario_id) || []
  const idsEncrenca = edicoesEncrenca.map(e => String(e.id))

  // 2. Vendas SÓ ENCRENCA
  const exemplaresEncrencaVendidos = d.vendasItens?.filter(iv => idsEncrenca.includes(String(iv.edicao_id)))
    .reduce((acc, curr) => acc + (curr.qtd || 1), 0) || d.vendas?.reduce((acc, v) => acc + (v.qtd_itens || 1), 0) || 0

  // 3. Totais Financeiros do Coletivo
  const totalRecebidoColetivo = d.vendas?.reduce((acc, v) => acc + (v.valor_pago_centavos || 0), 0) || 0
  const pendenteClientes = d.vendas?.reduce((acc, v) => acc + Math.max(0, (v.valor_total_centavos || 0) - (v.valor_pago_centavos || 0)), 0) || 0

  // 4. Regra dos Valores Devidos a Pessoas
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

  // Filtro de exibição na aba de estoque
  const edicoesFiltradasEstoque = d.edicoes?.filter(e => {
    if (filtroEstoqueDono === 'coletivo') return !e.proprietario_id
    if (filtroEstoqueDono === 'todos') return true
    return String(e.proprietario_id) === String(filtroEstoqueDono)
  }) || []

  return (
    <div>
      {/* Topo Roxo com Logo e Botão Sair Verde Limão */}
      <header className="top-header">
        <div className="brand-logo-box">
          <img 
            src="/logo.png" 
            alt="Logo" 
            onError={(e) => { 
              if (e.currentTarget.src.includes('/logo.png')) {
                e.currentTarget.src = 'logo.png'
              } else {
                e.currentTarget.style.display = 'none' 
              }
            }} 
          />
        </div>
        <div className="brand-title">DESENCRENCA</div>
        <button onClick={handleLogout} className="btn-sair">Sair</button>
      </header>

      <div className="main-wrapper">
        {/* Menu Principal de Abas Verdes */}
        <nav className="menu-tabs">
          <button onClick={() => setAba('visao_geral')} className={aba === 'visao_geral' ? 'ativo' : ''}>Visão geral</button>
          <button onClick={() => setAba('venda')} className={aba === 'venda' ? 'ativo' : ''}>Registrar venda</button>
          <button onClick={() => setAba('repasses')} className={aba === 'repasses' ? 'ativo' : ''}>Registrar repasse</button>
          <button onClick={() => setAba('estoque')} className={aba === 'estoque' ? 'ativo' : ''}>Estoque</button>
          <button onClick={() => setAba('cadastros')} className={aba === 'cadastros' ? 'ativo' : ''}>Cadastros</button>
        </nav>

        {/* VISÃO GERAL / PAINEL EM GRADE LADO A LADO */}
        {aba === 'visao_geral' && (
          <div>
            <h2 className="panel-title">Painel</h2>

            {/* Linha 1 de Cards do Painel (Grade Compacta) */}
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

            {/* Linha 2 de Cards do Coletivo e Produtos */}
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
                <div className="label">Valores Devidos a<br/>Pessoas</div>
                <div className="value" style={{ color: '#E53E3E' }}>{fmtMoney(totalValoresDevidosColetivo)}</div>
              </div>
              <div className="metric-card">
                <div className="label">Produtos do Coletivo<br/>Cadastrados</div>
                <div className="value">{edicoesEncrenca.length}</div>
              </div>
              <div className="metric-card">
                <div className="label">Produtos de Pessoas<br/>Cadastrados</div>
                <div className="value">{edicoesPessoas.length}</div>
              </div>
            </div>

            <div className="disclaimer">
              Totais acumulados desde o início do uso do app. Não são lucro nem saldo em caixa.
            </div>

            {/* SEÇÃO EXPANSÍVEL: ESTOQUE POR PRODUTO */}
            <div style={{ marginTop: '24px', borderTop: '2px solid #000', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="panel-title" style={{ margin: 0 }}>Estoque por produto (posição agora)</h3>
                <button onClick={() => setMostrarEstoqueProduto(!mostrarEstoqueProduto)} className="btn-action" style={{ margin: 0 }}>
                  {mostrarEstoqueProduto ? '- Ocultar Estoque por Produto' : '+ Ver Estoque por Produto'}
                </button>
              </div>

              {mostrarEstoqueProduto && (
                <div>
                  <button onClick={exportarCSV} className="btn-action" style={{ marginBottom: '12px' }}>
                    Exportar estoque (CSV)
                  </button>

                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Produto / Edição</th>
                          <th>Proprietário / Responsável</th>
                          <th>Exemplares em Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.edicoes?.map((e) => {
                          const dono = d.pessoas?.find(p => String(p.id) === String(e.proprietario_id))?.nome || 'Coletivo (Encrenca)'
                          const qtdTotal = d.saldos?.filter(s => String(s.edicao_id) === String(e.id)).reduce((acc, curr) => acc + (curr.qtd || 0), 0) || 0
                          return (
                            <tr key={e.id}>
                              <td>{e.titulo}</td>
                              <td>{dono}</td>
                              <td style={{ fontWeight: 'bold' }}>{qtdTotal} un</td>
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

            {/* PRODUTOS CADASTRADOS POR RESPONSÁVEL COM LINKS DE FILTRO */}
            <div style={{ marginTop: '20px', borderTop: '2px solid #000', paddingTop: '16px' }}>
              <h3 className="panel-title">Produtos cadastrados por responsável</h3>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Responsável / Proprietário</th>
                      <th>Qtd de Produtos</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Coletivo (Encrenca)</strong></td>
                      <td>
                        <button onClick={() => irParaEstoqueComFiltro('coletivo')} className="link-filtro">
                          {edicoesEncrenca.length} produtos (Ver no estoque)
                        </button>
                      </td>
                    </tr>
                    {d.pessoas?.filter(p => p.ativa !== false).map(p => {
                      const prodsPessoa = d.edicoes?.filter(e => String(e.proprietario_id) === String(p.id)) || []
                      return (
                        <tr key={p.id}>
                          <td>{p.nome}</td>
                          <td>
                            <button onClick={() => irParaEstoqueComFiltro(String(p.id))} className="link-filtro">
                              {prodsPessoa.length} produtos (Ver no estoque)
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ABA DE ESTOQUE COM FILTROS */}
        {aba === 'estoque' && (
          <div>
            <h2 className="panel-title">Gestão de Estoque</h2>

            {/* Filtros de Estoque */}
            <div style={{ background: '#FFF', border: '2px solid #000', padding: '14px', borderRadius: '8px', marginBottom: '20px', maxWidth: '800px' }}>
              <label style={{ margin: 0 }}>Filtrar Produtos por Responsável / Proprietário:
                <select value={filtroEstoqueDono} onChange={e => setFiltroEstoqueDono(e.target.value)} style={{ marginTop: '6px' }}>
                  <option value="todos">Todos os Produtos</option>
                  <option value="coletivo">Coletivo (Encrenca)</option>
                  {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Cadastro Rápido de Produto */}
            <div style={{ background: '#FFF', border: '2px solid #000', padding: '16px', borderRadius: '8px', marginBottom: '24px', maxWidth: '800px', boxShadow: '2px 2px 0 #000' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Cadastrar Novo Produto / Edição</h3>
              {estoqueMsg && <div style={{ padding: '8px', background: '#DCFCE7', color: '#166534', borderRadius: '4px', marginBottom: '10px', fontSize: '13px' }}>{estoqueMsg}</div>}

              <form onSubmit={handleCadastrarProdutoEstoque}>
                <label>Título do Produto / Edição
                  <input type="text" placeholder="Ex: Encrenca 4 ou Adesivo Zine" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} required />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label>Preço sugerido (R$)
                    <input type="text" placeholder="0,00" value={novoPreco} onChange={e => setNovoPreco(e.target.value)} />
                  </label>
                  <label>Quantidade inicial em estoque
                    <input type="number" placeholder="0" value={novoEstoqueQtd} onChange={e => setNovoEstoqueQtd(e.target.value)} />
                  </label>
                </div>

                <label>Responsável / Proprietário
                  <select value={novoDonoId} onChange={e => setNovoDonoId(e.target.value)}>
                    <option value="">Coletivo (Encrenca)</option>
                    {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </label>

                <button type="submit">Cadastrar Produto</button>
              </form>
            </div>

            {/* Tabela de Estoque Atual com Ajuste Rápido */}
            <h3 className="panel-title">Estoque Atual de Produtos</h3>
            <div className="table-container" style={{ maxWidth: '800px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produto / Edição</th>
                    <th>Responsável</th>
                    <th>Local</th>
                    <th>Saldo</th>
                    <th style={{ width: '120px', textAlign: 'center' }}>Ajuste Rápido</th>
                  </tr>
                </thead>
                <tbody>
                  {edicoesFiltradasEstoque.map(e => {
                    const dono = d.pessoas?.find(p => String(p.id) === String(e.proprietario_id))?.nome || 'Coletivo (Encrenca)'
                    const localPadrao = d.locais?.[0]
                    const saldo = d.saldos?.find(s => String(s.edicao_id) === String(e.id))
                    const qtdAtual = saldo?.qtd || 0
                    const localNome = d.locais?.find(l => String(l.id) === String(saldo?.local_id))?.nome || localPadrao?.nome || 'Estoque Geral'

                    return (
                      <tr key={e.id}>
                        <td><strong>{e.titulo}</strong></td>
                        <td>{dono}</td>
                        <td>{localNome}</td>
                        <td style={{ fontWeight: 'bold', color: qtdAtual > 0 ? '#2F855A' : '#E53E3E' }}>{qtdAtual} un</td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button 
                              type="button"
                              onClick={() => handleAjustarEstoque(String(e.id), String(saldo?.local_id || localPadrao?.id), -1)}
                              style={{ padding: '2px 8px', background: '#FEE2E2', border: '1px solid #000', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              -1
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleAjustarEstoque(String(e.id), String(saldo?.local_id || localPadrao?.id), 1)}
                              style={{ padding: '2px 8px', background: '#DCFCE7', border: '1px solid #000', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              +1
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {edicoesFiltradasEstoque.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#666' }}>Nenhum produto encontrado para este filtro.</td>
                    </tr>
                  )}
                </tbody>
              </table>
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
        {aba === 'cadastros' && <Cadastros d={d} onOk={carregar} />}
      </div>
    </div>
  )
}
