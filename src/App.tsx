import { useEffect, useState } from 'react'
import { supabase } from './supabase'
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
  const [mostrarProdsResponsavel, setMostrarProdsResponsavel] = useState(false)

  // Filtros da Tela de Estoque
  const [filtroEstoqueDono, setFiltroEstoqueDono] = useState<string>('todos')
  const [filtroEstoqueLocal, setFiltroEstoqueLocal] = useState<string>('todos')

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
      <div style={{ padding: '60px 20px', display: 'flex', justifyContent: 'center', background: '#FAF7F0', minHeight: '100vh' }}>
        <div style={{ width: '100%', maxWidth: '380px', background: '#FFF', border: '2px solid #000', padding: '24px', borderRadius: '12px', boxShadow: '4px 4px 0 #000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
            <img src="/logo.png" alt="Logo" style={{ height: '36px', objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
            <h2 style={{ textAlign: 'center', margin: 0 }}>DESENCRENCA</h2>
          </div>
          <p style={{ textAlign: 'center', fontSize: '13px', color: '#666', marginBottom: '20px' }}>Acesse com e-mail e senha</p>
          
          {loginErro && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>{loginErro}</div>}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
              E-mail
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
              Senha
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
            </label>
            <button type="submit" disabled={carregandoLogin} style={{ background: '#C5FF27', border: '2px solid #000', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '2px 2px 0 #000' }}>
              {carregandoLogin ? 'Entrando…' : 'Entrar'}
            </button>
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

  d.repasses?.forEach(r => {
    const pId = String(r.pessoa_id)
    if (valoresDevidosPorPessoa[pId]) {
      valoresDevidosPorPessoa[pId] -= (r.valor_centavos || 0)
    }
  })

  const totalValoresDevidosColetivo = Object.values(valoresDevidosPorPessoa).reduce((acc, curr) => acc + Math.max(0, curr), 0)

  // Filtro Duplo da Aba de Estoque
  const edicoesFiltradasEstoque = d.edicoes?.filter(e => {
    let passaDono = true
    if (filtroEstoqueDono === 'coletivo') passaDono = !e.proprietario_id
    else if (filtroEstoqueDono !== 'todos') passaDono = String(e.proprietario_id) === String(filtroEstoqueDono)

    let passaLocal = true
    if (filtroEstoqueLocal !== 'todos') {
      const temSaldoNoLocal = d.saldos?.some(s => String(s.edicao_id) === String(e.id) && String(s.local_id) === String(filtroEstoqueLocal) && (s.qtd || 0) > 0)
      passaLocal = temSaldoNoLocal
    }

    return passaDono && passaLocal
  }) || []

  return (
    <div style={{ background: '#FAF7F0', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* Injeção de CSS direto no componente para garantir aplicação */}
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background-color: #FAF7F0; font-family: sans-serif; }
        
        .header-top {
          background-color: #8A41F6;
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          border-bottom: 2px solid #000;
        }

        .btn-sair-verde {
          background-color: #C5FF27 !important;
          color: #000 !important;
          border: 2px solid #000 !important;
          border-radius: 6px !important;
          padding: 6px 16px !important;
          font-weight: 900 !important;
          cursor: pointer !important;
          font-size: 14px !important;
          box-shadow: 2px 2px 0px #000 !important;
        }

        .menu-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }

        .menu-tabs button {
          background: #C5FF27;
          border: 2px solid #000;
          border-radius: 8px;
          padding: 8px 16px;
          font-weight: bold;
          font-size: 14px;
          cursor: pointer;
          box-shadow: 2px 2px 0px #000;
        }

        .menu-tabs button.ativo {
          background: #A855F7;
          color: #FFF;
        }

        .cards-row {
          display: flex !important;
          flex-direction: row !important;
          flex-wrap: wrap !important;
          gap: 12px !important;
          margin-bottom: 16px !important;
        }

        .card-quadrado {
          background: #FFF !important;
          border: 2px solid #000 !important;
          border-radius: 8px !important;
          padding: 12px !important;
          box-shadow: 2px 2px 0px #000 !important;
          width: 185px !important;
          min-height: 90px !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
        }

        .card-quadrado .label { font-size: 11px; color: #4A5568; line-height: 1.2; }
        .card-quadrado .value { font-size: 20px; font-weight: 900; }

        .table-container {
          width: 100%;
          max-width: 650px;
          margin-bottom: 20px;
          background: #FFF;
          border: 2px solid #000;
          border-radius: 6px;
          overflow: hidden;
        }

        table.data-table { width: 100%; border-collapse: collapse; }
        table.data-table th, table.data-table td { border: 1px solid #000; padding: 8px 12px; font-size: 13px; text-align: left; }
        table.data-table th { background: #FFF; font-weight: bold; }

        .btn-action {
          background: #C5FF27;
          border: 2px solid #000;
          border-radius: 6px;
          padding: 6px 14px;
          font-weight: bold;
          font-size: 13px;
          cursor: pointer;
          box-shadow: 2px 2px 0px #000;
        }

        .link-filtro {
          background: none;
          border: none;
          color: #000;
          font-weight: bold;
          text-decoration: underline;
          cursor: pointer;
          font-size: 13px;
        }
      `}</style>

      {/* Topo Roxo */}
      <header className="header-top">
        <div style={{ width: '40px', height: '40px', border: '2px dashed #C5FF27', borderRadius: '6px', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
        <div style={{ color: '#C5FF27', fontSize: '24px', fontWeight: '900', letterSpacing: '2px' }}>DESENCRENCA</div>
        <button onClick={handleLogout} className="btn-sair-verde">Sair</button>
      </header>

      <div style={{ padding: '20px 24px', maxWidth: '1350px', margin: '0 auto' }}>
        {/* Menu Principal */}
        <nav className="menu-tabs">
          <button onClick={() => setAba('visao_geral')} className={aba === 'visao_geral' ? 'ativo' : ''}>Visão geral</button>
          <button onClick={() => setAba('venda')} className={aba === 'venda' ? 'ativo' : ''}>Registrar venda</button>
          <button onClick={() => setAba('repasses')} className={aba === 'repasses' ? 'ativo' : ''}>Registrar repasse</button>
          <button onClick={() => setAba('estoque')} className={aba === 'estoque' ? 'ativo' : ''}>Estoque</button>
          <button onClick={() => setAba('cadastros')} className={aba === 'cadastros' ? 'ativo' : ''}>Cadastros</button>
        </nav>

        {/* VISÃO GERAL / PAINEL EM CARDS QUADRADINHOS */}
        {aba === 'visao_geral' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Painel</h2>

            {/* Linha 1 de Cards em Quadradinhos Lado a Lado */}
            <div className="cards-row">
              <div className="card-quadrado">
                <div className="label">Exemplares Encrenca<br/>Vendidos (Total)</div>
                <div className="value">{exemplaresEncrencaVendidos} un</div>
              </div>

              {edicoesEncrenca.slice(0, mostrarMaisEdicoes ? edicoesEncrenca.length : 3).map(e => {
                const qtd = d.vendasItens?.filter(iv => String(iv.edicao_id) === String(e.id)).reduce((acc, curr) => acc + (curr.qtd || 1), 0) || 0
                return (
                  <div key={e.id} className="card-quadrado">
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

            {/* Linha 2 de Cards em Quadradinhos Lado a Lado */}
            <div className="cards-row">
              <div className="card-quadrado">
                <div className="label">Total Recebido pelo<br/>Coletivo</div>
                <div className="value">{fmtMoney(totalRecebidoColetivo)}</div>
              </div>
              <div className="card-quadrado">
                <div className="label">Pendente de Clientes<br/>(A Receber)</div>
                <div className="value">{fmtMoney(pendenteClientes)}</div>
              </div>
              <div className="card-quadrado" style={{ borderColor: '#E53E3E' }}>
                <div className="label">Valores Devidos a<br/>Pessoas</div>
                <div className="value" style={{ color: '#E53E3E' }}>{fmtMoney(totalValoresDevidosColetivo)}</div>
              </div>
              <div className="card-quadrado">
                <div className="label">Produtos do Coletivo<br/>Cadastrados</div>
                <div className="value">{edicoesEncrenca.length}</div>
              </div>
              <div className="card-quadrado">
                <div className="label">Produtos de Pessoas<br/>Cadastrados</div>
                <div className="value">{edicoesPessoas.length}</div>
              </div>
            </div>

            <p style={{ fontSize: '11px', color: '#666', marginTop: '4px', marginBottom: '24px' }}>
              Totais acumulados desde o início do uso do app. Não são lucro nem saldo em caixa.
            </p>

            {/* SEÇÃO EXPANSÍVEL: ESTOQUE POR PRODUTO */}
            <div style={{ marginTop: '24px', borderTop: '2px solid #000', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Estoque por produto (posição agora)</h3>
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
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Dinheiro sob responsabilidade das pessoas (posição agora)</h3>
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
                </div>
              )}
            </div>

            {/* SEÇÃO EXPANSÍVEL: PRODUTOS CADASTRADOS POR RESPONSÁVEL */}
            <div style={{ marginTop: '20px', borderTop: '2px solid #000', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Produtos cadastrados por responsável</h3>
                <button onClick={() => setMostrarProdsResponsavel(!mostrarProdsResponsavel)} className="btn-action" style={{ margin: 0 }}>
                  {mostrarProdsResponsavel ? '- Ocultar Produtos por Responsável' : '+ Ver Produtos por Responsável'}
                </button>
              </div>

              {mostrarProdsResponsavel && (
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
              )}
            </div>

          </div>
        )}

        {/* ABA DE ESTOQUE COM FILTROS DUPLOS */}
        {aba === 'estoque' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Gestão de Estoque</h2>

            {/* Cadastro Rápido de Produto */}
            <div style={{ background: '#FFF', border: '2px solid #000', padding: '16px', borderRadius: '8px', marginBottom: '24px', maxWidth: '800px', boxShadow: '2px 2px 0 #000' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Cadastrar Novo Produto / Edição</h3>
              {estoqueMsg && <div style={{ padding: '8px', background: '#DCFCE7', color: '#166534', borderRadius: '4px', marginBottom: '10px', fontSize: '13px' }}>{estoqueMsg}</div>}

              <form onSubmit={handleCadastrarProdutoEstoque} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                  Título do Produto / Edição
                  <input type="text" placeholder="Ex: Encrenca 4 ou Adesivo Zine" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                    Preço sugerido (R$)
                    <input type="text" placeholder="0,00" value={novoPreco} onChange={e => setNovoPreco(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                    Quantidade inicial em estoque
                    <input type="number" placeholder="0" value={novoEstoqueQtd} onChange={e => setNovoEstoqueQtd(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
                  </label>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                  Responsável / Proprietário
                  <select value={novoDonoId} onChange={e => setNovoDonoId(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                    <option value="">Coletivo (Encrenca)</option>
                    {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </label>

                <button type="submit" style={{ background: '#C5FF27', border: '2px solid #000', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '2px 2px 0 #000' }}>Cadastrar Produto</button>
              </form>
            </div>

            {/* Painel de Filtros Duplos */}
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>Estoque Atual de Produtos</h3>
            <div style={{ background: '#FFF', border: '2px solid #000', padding: '14px', borderRadius: '8px', marginBottom: '20px', maxWidth: '800px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Filtrar por Responsável:
                <select value={filtroEstoqueDono} onChange={e => setFiltroEstoqueDono(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                  <option value="todos">Todos os Responsáveis</option>
                  <option value="coletivo">Coletivo (Encrenca)</option>
                  {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Filtrar por Local de Estoque:
                <select value={filtroEstoqueLocal} onChange={e => setFiltroEstoqueLocal(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                  <option value="todos">Todos os Locais</option>
                  {d.locais?.map(l => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Tabela de Estoque Atual */}
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
                    const saldo = d.saldos?.find(s => String(s.edicao_id) === String(e.id) && (filtroEstoqueLocal === 'todos' || String(s.local_id) === String(filtroEstoqueLocal)))
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
                      <td colSpan={5} style={{ textAlign: 'center', color: '#666' }}>Nenhum produto encontrado com os filtros selecionados.</td>
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
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Registrar Repasse para Pessoa Cadastrada</h2>
            {repasseMsg && <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #86EFAC' }}>{repasseMsg}</div>}

            <form onSubmit={handleSalvarRepasse} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Pessoa beneficiária do repasse
                <select value={repassePessoaId} onChange={e => setRepassePessoaId(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                  <option value="">Selecione a pessoa</option>
                  {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome} (Devido atual: {fmtMoney(valoresDevidosPorPessoa[String(p.id)] || 0)})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Valor repassado (R$)
                <input inputMode="decimal" placeholder="0,00" value={repasseValor} onChange={e => setRepasseValor(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Observação (opcional)
                <input placeholder="Ex: Transferência via Pix realizada" value={repasseObs} onChange={e => setRepasseObs(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
              </label>

              <button type="submit" style={{ background: '#C5FF27', border: '2px solid #000', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '2px 2px 0 #000' }}>Salvar Repasse</button>
            </form>
          </div>
        )}

        {aba === 'venda' && <VendaForm d={d} onOk={carregar} />}
        {aba === 'cadastros' && <Cadastros d={d} onOk={carregar} />}
      </div>
    </div>
  )
}
