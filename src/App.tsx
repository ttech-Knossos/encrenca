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

  const [aba, setAba] = useState<'visao_geral' | 'venda' | 'vendas_lista' | 'repasses' | 'estoque' | 'cadastros'>('visao_geral')
  const [d, setD] = useState<Dados>({})
  const [erro, setErro] = useState('')

  // Expansores da tela Visão Geral
  const [mostrarMaisEdicoes, setMostrarMaisEdicoes] = useState(false)

  // Expansores e Filtros da Lista de Vendas
  const [vendasAbertas, setVendasAbertas] = useState<Record<string, boolean>>({})
  const [filtroVendaDataInicio, setFiltroVendaDataInicio] = useState('')
  const [filtroVendaDataFim, setFiltroVendaDataFim] = useState('')
  const [filtroVendaEvento, setFiltroVendaEvento] = useState('todos')

  // Filtros e Expansores da Tela de Estoque
  const [filtroEstoqueDono, setFiltroEstoqueDono] = useState<string>('todos')
  const [filtroEstoqueLocal, setFiltroEstoqueLocal] = useState<string>('todos')
  const [filtroEstoqueDataInicio, setFiltroEstoqueDataInicio] = useState('')
  const [filtroEstoqueDataFim, setFiltroEstoqueDataFim] = useState('')
  const [produtosExpandidos, setProdutosExpandidos] = useState<Record<string, boolean>>({})

  // Transferência de Estoque com Quantidade
  const [transfEdicaoId, setTransfEdicaoId] = useState('')
  const [transfOrigemLocalId, setTransfOrigemLocalId] = useState('')
  const [transfNovaPessoaId, setTransfNovaPessoaId] = useState('')
  const [transfQtd, setTransfQtd] = useState('1')
  const [transfMsg, setTransfMsg] = useState('')

  // Formulário de Repasse
  const [origemRepasse, setOrigemRepasse] = useState<'coletivo_para_pessoa' | 'pessoa_para_coletivo'>('coletivo_para_pessoa')
  const [repassePessoaId, setRepassePessoaId] = useState('')
  const [repasseValor, setRepasseValor] = useState('')
  const [repasseObs, setRepasseObs] = useState('')
  const [repasseMsg, setRepasseMsg] = useState('')

  // Cadastro Rápido de Produto na aba Estoque
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoPreco, setNovoPreco] = useState('')
  const [novoDonoId, setNovoDonoId] = useState('')
  const [novoIsEdicao, setNovoIsEdicao] = useState(false)
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

  function toggleVendaExpandida(vendaId: string) {
    setVendasAbertas(prev => ({ ...prev, [vendaId]: !prev[vendaId] }))
  }

  function toggleProdutoExpandido(prodId: string) {
    setProdutosExpandidos(prev => ({ ...prev, [prodId]: !prev[prodId] }))
  }

  async function handleSalvarRepasse(e: React.FormEvent) {
    e.preventDefault()
    if (!repassePessoaId || !repasseValor) return

    setRepasseMsg('')
    const valorCentavos = Math.round(parseFloat(repasseValor.replace(',', '.')) * 100)

    try {
      const obsFinal = origemRepasse === 'coletivo_para_pessoa'
        ? `Repasse do Coletivo Encrenca para Pessoa: ${repasseObs || 'Pagamento referente a vendas do coletivo'}`
        : `Repasse da Pessoa para o Coletivo Encrenca: ${repasseObs || 'Acerto de caixa'}`

      const { error } = await supabase!.from('repasses').insert({
        pessoa_id: repassePessoaId,
        valor_centavos: valorCentavos,
        obs: obsFinal
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
        proprietario_id: novoDonoId || null,
        is_edicao: novoIsEdicao
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
      setNovoIsEdicao(false)
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

  async function handleTransferirEstoque(e: React.FormEvent) {
    e.preventDefault()
    if (!transfEdicaoId) return
    setTransfMsg('')

    try {
      const qtdNum = parseInt(transfQtd) || 1
      const novoProprietarioId = transfNovaPessoaId ? transfNovaPessoaId : null
      
      const { error } = await supabase!.from('edicoes').update({
        proprietario_id: novoProprietarioId
      }).eq('id', transfEdicaoId)

      if (error) throw error

      let localDestinoId = ''
      if (novoProprietarioId) {
        const locPessoa = d.locais?.find(l => l.tipo === 'pessoa' && String(l.pessoa_id) === String(novoProprietarioId))
        localDestinoId = locPessoa?.id || d.locais?.[0]?.id
      } else {
        localDestinoId = d.locais?.find(l => l.tipo === 'central')?.id || d.locais?.[0]?.id
      }

      const localOrigemId = transfOrigemLocalId || d.locais?.[0]?.id

      if (localOrigemId && localDestinoId && localOrigemId !== localDestinoId) {
        const saldoOrigem = d.saldos?.find(s => String(s.edicao_id) === String(transfEdicaoId) && String(s.local_id) === String(localOrigemId))
        const qtdAtualOrigem = saldoOrigem?.qtd || 0
        const novaQtdOrigem = Math.max(0, qtdAtualOrigem - qtdNum)

        if (saldoOrigem?.id) {
          await supabase!.from('saldos_estoque').update({ qtd: novaQtdOrigem }).eq('id', saldoOrigem.id)
        }

        const saldoDestino = d.saldos?.find(s => String(s.edicao_id) === String(transfEdicaoId) && String(s.local_id) === String(localDestinoId))
        const qtdAtualDestino = saldoDestino?.qtd || 0
        const novaQtdDestino = qtdAtualDestino + qtdNum

        if (saldoDestino?.id) {
          await supabase!.from('saldos_estoque').update({ qtd: novaQtdDestino }).eq('id', saldoDestino.id)
        } else {
          await supabase!.from('saldos_estoque').insert({ edicao_id: transfEdicaoId, local_id: localDestinoId, qtd: qtdNum })
        }
      }

      setTransfMsg(`Responsabilidade e ${qtdNum} un transferidas com sucesso!`)
      setTransfEdicaoId('')
      setTransfOrigemLocalId('')
      setTransfNovaPessoaId('')
      setTransfQtd('1')
      carregar()
    } catch (e: any) {
      setTransfMsg('Erro na transferência: ' + e.message)
    }
  }

  if (!session) {
    return (
      <div style={{ padding: '60px 20px', display: 'flex', justifyContent: 'center', background: '#FAF7F0', minHeight: '100vh' }}>
        <div style={{ width: '100%', maxWidth: '380px', background: '#FFF', border: '2px solid #000', padding: '24px', borderRadius: '12px', boxShadow: '4px 4px 0 #000' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', background: '#C5FF27', border: '2px solid #000', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900' }}>⚡</div>
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

  // PRODUTOS COM FLAG DE EDIÇÃO
  const edicoesEncrenca = d.edicoes?.filter(e => e.is_edicao || !e.proprietario_id) || []
  const edicoesSomenteComFlag = d.edicoes?.filter(e => e.is_edicao) || []
  const produtosOutrasPessoas = d.edicoes?.filter(e => !!e.proprietario_id && !e.is_edicao) || []

  const idsEdicoesEncrenca = edicoesEncrenca.map(e => String(e.id))
  const idsProdutosPessoas = produtosOutrasPessoas.map(e => String(e.id))

  // CÁLCULO DE EXEMPLARES VENDIDOS
  let exemplaresEncrencaVendidos = 0
  let exemplaresPessoasVendidos = 0

  if (d.vendasItens && d.vendasItens.length > 0) {
    d.vendasItens.forEach(iv => {
      const eId = String(iv.edicao_id)
      const qtd = iv.qtd || 1
      if (idsEdicoesEncrenca.includes(eId)) {
        exemplaresEncrencaVendidos += qtd
      } else if (idsProdutosPessoas.includes(eId)) {
        exemplaresPessoasVendidos += qtd
      }
    })
  } else if (d.vendas) {
    exemplaresEncrencaVendidos = d.vendas.reduce((acc, v) => acc + (v.qtd_itens || 1), 0)
  }

  // CÁLCULOS FINANCEIROS
  let totalRecebidoColetivo = 0
  let totalRecebidoPessoasDireto = 0

  d.vendas?.forEach(v => {
    let valorVenda = v.valor_pago_centavos || v.valor_total_centavos || 0
    if (!valorVenda) {
      const itens = d.vendasItens?.filter(iv => String(iv.venda_id) === String(v.id)) || []
      valorVenda = itens.reduce((acc, iv) => acc + ((iv.preco_centavos || 0) * (iv.qtd || 1)), 0)
    }

    if (v.recebedor_pessoa_id) {
      totalRecebidoPessoasDireto += valorVenda
    } else {
      totalRecebidoColetivo += valorVenda
    }
  })

  const pendenteClientes = d.vendas?.reduce((acc, v) => acc + Math.max(0, (v.valor_total_centavos || 0) - (v.valor_pago_centavos || 0)), 0) || 0

  const valoresDevidosPorPessoa: Record<string, number> = {}
  d.vendasItens?.forEach(iv => {
    const prod = d.edicoes?.find(e => String(e.id) === String(iv.edicao_id))
    const venda = d.vendas?.find(v => String(v.id) === String(v.id))
    
    if (prod && prod.proprietario_id && (!venda || !venda.recebedor_pessoa_id)) {
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

  // FILTRAGEM DE ESTOQUE
  const edicoesFiltradasEstoque = d.edicoes?.filter(e => {
    let passaDono = true
    if (filtroEstoqueDono === 'coletivo') passaDono = !e.proprietario_id
    else if (filtroEstoqueDono !== 'todos') passaDono = String(e.proprietario_id) === String(filtroEstoqueDono)

    let passaLocal = true
    if (filtroEstoqueLocal !== 'todos') {
      passaLocal = d.saldos?.some(s => String(s.edicao_id) === String(e.id) && String(s.local_id) === String(filtroEstoqueLocal) && (s.qtd || 0) > 0) || false
    }

    let passaData = true
    if (e.created_at) {
      const dataCriacao = new Date(e.created_at).toISOString().split('T')[0]
      if (filtroEstoqueDataInicio && dataCriacao < filtroEstoqueDataInicio) passaData = false
      if (filtroEstoqueDataFim && dataCriacao > filtroEstoqueDataFim) passaData = false
    }

    return passaDono && passaLocal && passaData
  }) || []

  // FILTRAGEM DE VENDAS
  const vendasFiltradas = d.vendas?.filter(v => {
    let passaData = true
    if (v.created_at) {
      const dataVenda = new Date(v.created_at).toISOString().split('T')[0]
      if (filtroVendaDataInicio && dataVenda < filtroVendaDataInicio) passaData = false
      if (filtroVendaDataFim && dataVenda > filtroVendaDataFim) passaData = false
    }

    let passaEvento = true
    if (filtroVendaEvento !== 'todos') {
      passaEvento = String(v.evento_id) === String(filtroVendaEvento)
    }

    return passaData && passaEvento
  }) || []

  return (
    <div style={{ background: '#FAF7F0', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background-color: #FAF7F0; font-family: sans-serif; }
        
        .header-top {
          background-color: #8A41F6;
          min-height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          border-bottom: 2px solid #000;
          width: 100%;
        }

        .logo-container {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0 auto;
        }

        .logo-img {
          width: 40px;
          height: 40px;
          border-radius: 6px;
          border: 2px solid #000;
          object-fit: cover;
          background: #C5FF27;
        }

        .logo-title {
          color: #C5FF27;
          font-size: 26px;
          font-weight: 900;
          letter-spacing: 2px;
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
          min-height: 95px !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          cursor: pointer;
          transition: transform 0.1s ease;
        }

        .card-quadrado:hover {
          transform: translateY(-2px);
          background-color: #FCF9F2 !important;
        }

        .card-quadrado .label { font-size: 11px; color: #4A5568; line-height: 1.2; }
        .card-quadrado .value { font-size: 20px; font-weight: 900; }

        .table-container {
          width: 100%;
          max-width: 850px;
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
      `}</style>

      {/* Header Roxo com Logo Perfeitamente Centralizada */}
      <header className="header-top">
        <div style={{ width: '60px' }}></div> {/* Espaçador esquerdo para balancear o botão sair e centralizar o logo */}
        <div className="logo-container">
          <img src="/logo_3.png" alt="Logo Desencrenca" className="logo-img" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <div className="logo-title">DESENCRENCA</div>
        </div>
        <button onClick={handleLogout} className="btn-sair-verde">Sair</button>
      </header>

      <div style={{ padding: '20px 24px', maxWidth: '1350px', margin: '0 auto' }}>
        {/* Menu Principal */}
        <nav className="menu-tabs">
          <button onClick={() => setAba('visao_geral')} className={aba === 'visao_geral' ? 'ativo' : ''}>Visão geral</button>
          <button onClick={() => setAba('venda')} className={aba === 'venda' ? 'ativo' : ''}>Registrar venda</button>
          <button onClick={() => setAba('vendas_lista')} className={aba === 'vendas_lista' ? 'ativo' : ''}>Vendas registradas</button>
          <button onClick={() => setAba('repasses')} className={aba === 'repasses' ? 'ativo' : ''}>Registrar repasse</button>
          <button onClick={() => setAba('estoque')} className={aba === 'estoque' ? 'ativo' : ''}>Estoque / Produtos</button>
          <button onClick={() => setAba('cadastros')} className={aba === 'cadastros' ? 'ativo' : ''}>Cadastros Gerais</button>
        </nav>

        {/* VISÃO GERAL / PAINEL COMPLETO */}
        {aba === 'visao_geral' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Painel</h2>

            <div className="cards-row">
              <div className="card-quadrado" onClick={() => setAba('vendas_lista')}>
                <div className="label">Exemplares Encrenca<br/>Vendidos (Total)</div>
                <div className="value">{exemplaresEncrencaVendidos} un</div>
                <div style={{ fontSize: '10px', color: '#7C3AED', textDecoration: 'underline' }}>Ver Vendas ➔</div>
              </div>

              <div className="card-quadrado" onClick={() => setAba('vendas_lista')} style={{ border: '2px solid #2563EB' }}>
                <div className="label">Exemplares de Pessoas<br/>Vendidos (Outros)</div>
                <div className="value" style={{ color: '#2563EB' }}>{exemplaresPessoasVendidos} un</div>
                <div style={{ fontSize: '10px', color: '#2563EB', textDecoration: 'underline' }}>Ver Detalhes ➔</div>
              </div>

              {edicoesSomenteComFlag.slice(0, mostrarMaisEdicoes ? edicoesSomenteComFlag.length : 2).map(e => {
                const qtd = d.vendasItens?.filter(iv => String(iv.edicao_id) === String(e.id)).reduce((acc, curr) => acc + (curr.qtd || 1), 0) || 0
                return (
                  <div key={e.id} className="card-quadrado" onClick={() => irParaEstoqueComFiltro('coletivo')}>
                    <div className="label">Vendidos (Edição):<br/>{e.titulo}</div>
                    <div className="value">{qtd} un</div>
                    <div style={{ fontSize: '10px', color: '#7C3AED', textDecoration: 'underline' }}>Ver no Estoque ➔</div>
                  </div>
                )
              })}

              {edicoesSomenteComFlag.length > 2 && (
                <button 
                  onClick={() => setMostrarMaisEdicoes(!mostrarMaisEdicoes)}
                  className="btn-action" 
                  style={{ alignSelf: 'center', margin: 0 }}
                >
                  {mostrarMaisEdicoes ? '- Ocultar edições' : '+ Ver mais edições'}
                </button>
              )}
            </div>

            <div className="cards-row">
              <div className="card-quadrado" onClick={() => setAba('vendas_lista')}>
                <div className="label">Total Recebido pelo<br/>Coletivo</div>
                <div className="value">{fmtMoney(totalRecebidoColetivo)}</div>
                <div style={{ fontSize: '10px', color: '#7C3AED', textDecoration: 'underline' }}>Ver Vendas ➔</div>
              </div>

              <div className="card-quadrado" onClick={() => setAba('vendas_lista')}>
                <div className="label">Total Recebido por<br/>Pessoas (Direto)</div>
                <div className="value">{fmtMoney(totalRecebidoPessoasDireto)}</div>
                <div style={{ fontSize: '10px', color: '#7C3AED', textDecoration: 'underline' }}>Ver Vendas ➔</div>
              </div>

              <div className="card-quadrado" onClick={() => setAba('vendas_lista')}>
                <div className="label">Pendente de Clientes<br/>(A Receber)</div>
                <div className="value">{fmtMoney(pendenteClientes)}</div>
                <div style={{ fontSize: '10px', color: '#7C3AED', textDecoration: 'underline' }}>Ver Pendentes ➔</div>
              </div>

              <div className="card-quadrado" onClick={() => setAba('repasses')} style={{ borderColor: '#E53E3E' }}>
                <div className="label">Valores Devidos a<br/>Pessoas</div>
                <div className="value" style={{ color: '#E53E3E' }}>{fmtMoney(totalValoresDevidosColetivo)}</div>
                <div style={{ fontSize: '10px', color: '#E53E3E', textDecoration: 'underline' }}>Repassar ➔</div>
              </div>

              <div className="card-quadrado" onClick={() => irParaEstoqueComFiltro('coletivo')}>
                <div className="label">Produtos do Coletivo<br/>Cadastrados</div>
                <div className="value">{edicoesEncrenca.length}</div>
                <div style={{ fontSize: '10px', color: '#7C3AED', textDecoration: 'underline' }}>Ver no Estoque ➔</div>
              </div>

              <div className="card-quadrado" onClick={() => irParaEstoqueComFiltro('todos')}>
                <div className="label">Produtos de Pessoas<br/>Cadastrados</div>
                <div className="value">{produtosOutrasPessoas.length}</div>
                <div style={{ fontSize: '10px', color: '#7C3AED', textDecoration: 'underline' }}>Ver no Estoque ➔</div>
              </div>
            </div>

            {/* BLOCOS DETALHADOS DA VISÃO GERAL */}
            <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', maxWidth: '1150px' }}>
              
              {/* Bloco 1: Valores Devidos a Pessoas Detalhado */}
              <div style={{ background: '#FFF', border: '2px solid #000', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 #000' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '10px' }}>Valores Devidos a Pessoas (Acumulado)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {d.pessoas?.filter(p => p.ativa !== false).map(p => {
                    const devido = valoresDevidosPorPessoa[String(p.id)] || 0
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#FAF7F0', border: '1px solid #CCC', borderRadius: '6px', fontSize: '13px' }}>
                        <span><strong>{p.nome}</strong></span>
                        <span style={{ color: devido > 0 ? '#E53E3E' : '#2F855A', fontWeight: 'bold' }}>{fmtMoney(devido)}</span>
                      </div>
                    )
                  })}
                  {(!d.pessoas || d.pessoas.length === 0) && (
                    <div style={{ fontSize: '13px', color: '#666' }}>Nenhuma pessoa cadastrada.</div>
                  )}
                </div>
              </div>

              {/* Bloco 2: Resumo de Produtos por Responsável */}
              <div style={{ background: '#FFF', border: '2px solid #000', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 #000' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '10px' }}>Resumo de Produtos por Responsável</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div onClick={() => irParaEstoqueComFiltro('coletivo')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FAF7F0', border: '1px solid #CCC', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <div>
                      <strong>Coletivo (Encrenca)</strong>
                      <div style={{ fontSize: '11px', color: '#666' }}>{edicoesEncrenca.length} produtos cadastrados</div>
                    </div>
                    <span style={{ fontWeight: 'bold', color: '#7C3AED' }}>Ver Estoque ➔</span>
                  </div>

                  {d.pessoas?.filter(p => p.ativa !== false).map(p => {
                    const prodsPessoa = d.edicoes?.filter(e => String(e.proprietario_id) === String(p.id)) || []
                    return (
                      <div key={p.id} onClick={() => irParaEstoqueComFiltro(p.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#FAF7F0', border: '1px solid #CCC', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <div>
                          <strong>{p.nome}</strong>
                          <div style={{ fontSize: '11px', color: '#666' }}>{prodsPessoa.length} produtos cadastrados</div>
                        </div>
                        <span style={{ fontWeight: 'bold', color: '#7C3AED' }}>Ver Estoque ➔</span>
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>

            {/* Bloco 3: Visão Geral de Estoque de Encrenca por Pessoa (Apenas Edições com Flag Ativada e Ajuste Automático) */}
            <div style={{ marginTop: '20px', background: '#FFF', border: '2px solid #000', padding: '16px', borderRadius: '8px', maxWidth: '1150px', boxShadow: '2px 2px 0 #000' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '10px' }}>Visão Geral de Estoque de Encrenca por Pessoa</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                {d.locais?.map(loc => {
                  // Filtrar apenas saldos cujos produtos possuem a flag is_edicao === true
                  const prodsNoLocalEdicoes = d.saldos?.filter(s => {
                    if (String(s.local_id) !== String(loc.id)) return false
                    const prod = d.edicoes?.find(e => String(e.id) === String(s.edicao_id))
                    return prod && prod.is_edicao === true
                  }) || []

                  const totalUnidadesLocal = prodsNoLocalEdicoes.reduce((acc, curr) => acc + (curr.qtd || 0), 0)
                  
                  // Encontrar uma edição correspondente neste local para permitir ajuste rápido automático
                  const primeiraEdicaoLocalId = prodsNoLocalEdicoes[0]?.edicao_id || d.edicoes?.find(e => e.is_edicao)?.id

                  return (
                    <div key={loc.id} style={{ border: '1px solid #CCC', padding: '12px', borderRadius: '6px', background: '#FAF7F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{loc.nome}</strong>
                        <div style={{ fontSize: '13px', marginTop: '4px', color: '#333' }}>Total em estoque (Edições): <strong>{totalUnidadesLocal} un</strong></div>
                      </div>
                      {primeiraEdicaoLocalId && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                          <button onClick={() => handleAjustarEstoque(String(primeiraEdicaoLocalId), String(loc.id), -1)} style={{ padding: '2px 8px', background: '#FEE2E2', border: '1px solid #000', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>-1 un</button>
                          <button onClick={() => handleAjustarEstoque(String(primeiraEdicaoLocalId), String(loc.id), 1)} style={{ padding: '2px 8px', background: '#DCFCE7', border: '1px solid #000', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>+1 un</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <p style={{ fontSize: '11px', color: '#666', marginTop: '16px', marginBottom: '24px' }}>
              Totais acumulados desde o início do uso do app. Não são lucro nem saldo em caixa.
            </p>
          </div>
        )}

        {/* ABA: VENDAS REGISTRADAS */}
        {aba === 'vendas_lista' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Histórico de Vendas Registradas</h2>

            <div style={{ background: '#FFF', border: '2px solid #000', padding: '14px', borderRadius: '8px', marginBottom: '20px', maxWidth: '850px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                Data Inicial:
                <input type="date" value={filtroVendaDataInicio} onChange={e => setFiltroVendaDataInicio(e.target.value)} style={{ padding: '6px', border: '2px solid #000', borderRadius: '6px' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                Data Final:
                <input type="date" value={filtroVendaDataFim} onChange={e => setFiltroVendaDataFim(e.target.value)} style={{ padding: '6px', border: '2px solid #000', borderRadius: '6px' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                Filtrar por Evento:
                <select value={filtroVendaEvento} onChange={e => setFiltroVendaEvento(e.target.value)} style={{ padding: '6px', border: '2px solid #000', borderRadius: '6px' }}>
                  <option value="todos">Todos os Eventos</option>
                  {d.eventos?.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.nome}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '850px' }}>
              {vendasFiltradas.map(v => {
                const aberta = !!vendasAbertas[String(v.id)]
                const recebedorNome = v.recebedor_pessoa_id 
                  ? d.pessoas?.find(p => String(p.id) === String(v.recebedor_pessoa_id))?.nome || 'Pessoa'
                  : 'Coletivo (Encrenca)'

                const eventoNome = v.evento_id 
                  ? d.eventos?.find(e => String(e.id) === String(v.evento_id))?.nome
                  : null

                const itensVenda = d.vendasItens?.filter(iv => String(iv.venda_id) === String(v.id)) || []

                let totalExibicao = v.valor_pago_centavos || v.valor_total_centavos || 0
                if (totalExibicao === 0 && itensVenda.length > 0) {
                  totalExibicao = itensVenda.reduce((acc, iv) => acc + ((iv.preco_centavos || 0) * (iv.qtd || 1)), 0)
                }

                return (
                  <div key={v.id} style={{ background: '#FFF', border: '2px solid #000', borderRadius: '8px', overflow: 'hidden', boxShadow: '2px 2px 0 #000' }}>
                    <div 
                      onClick={() => toggleVendaExpandida(String(v.id))}
                      style={{ padding: '12px 16px', background: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div>
                        <strong>Venda #{String(v.id).slice(0, 8)}</strong> - {v.created_at ? new Date(v.created_at).toLocaleDateString('pt-BR') : 'Data recente'}
                        {eventoNome && <span style={{ marginLeft: '8px', padding: '2px 6px', background: '#FEF3C7', border: '1px solid #D97706', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>📍 {eventoNome}</span>}
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                          Recebedor: <strong>{recebedorNome}</strong> | Forma de Pagamento: {v.meio_pagamento || 'Pix/Dinheiro'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: '900', color: '#2F855A' }}>{fmtMoney(totalExibicao)}</div>
                        <button className="btn-action" style={{ padding: '2px 8px', fontSize: '11px', marginTop: '4px' }}>
                          {aberta ? '- Ocultar Itens' : '+ Ver Itens'}
                        </button>
                      </div>
                    </div>

                    {aberta && (
                      <div style={{ borderTop: '1px solid #000', padding: '12px 16px', background: '#FAF7F0' }}>
                        <h4 style={{ fontSize: '13px', marginBottom: '8px' }}>Itens Desta Venda:</h4>
                        {itensVenda.length > 0 ? (
                          <table className="data-table" style={{ background: '#FFF' }}>
                            <thead>
                              <tr>
                                <th>Produto</th>
                                <th>Responsável</th>
                                <th>Qtd</th>
                                <th>Valor Unitário</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {itensVenda.map((iv, idx) => {
                                const prod = d.edicoes?.find(e => String(e.id) === String(iv.edicao_id))
                                const dono = prod?.proprietario_id 
                                  ? d.pessoas?.find(p => String(p.id) === String(prod.proprietario_id))?.nome || 'Pessoa'
                                  : 'Coletivo (Encrenca)'
                                const unit = iv.preco_centavos || prod?.preco_sugerido_centavos || 0
                                const qtd = iv.qtd || 1

                                return (
                                  <tr key={idx}>
                                    <td><strong>{prod?.titulo || 'Produto'}</strong></td>
                                    <td>{dono}</td>
                                    <td>{qtd} un</td>
                                    <td>{fmtMoney(unit)}</td>
                                    <td style={{ fontWeight: 'bold' }}>{fmtMoney(unit * qtd)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ fontSize: '12px', color: '#666' }}>Sem itens detalhados. Venda direta de {fmtMoney(totalExibicao)}.</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {vendasFiltradas.length === 0 && (
                <div style={{ padding: '20px', background: '#FFF', border: '2px solid #000', borderRadius: '8px' }}>Nenhuma venda encontrada com os filtros selecionados.</div>
              )}
            </div>
          </div>
        )}

        {/* ABA DE ESTOQUE E PRODUTOS */}
        {aba === 'estoque' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Gestão de Estoque e Produtos</h2>

            {/* Cadastro de Novo Produto/Edição */}
            <div style={{ background: '#FFF', border: '2px solid #000', padding: '16px', borderRadius: '8px', marginBottom: '24px', maxWidth: '850px', boxShadow: '2px 2px 0 #000' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Cadastrar Novo Produto / Edição</h3>
              {estoqueMsg && <div style={{ padding: '8px', background: '#DCFCE7', color: '#166534', borderRadius: '4px', marginBottom: '10px', fontSize: '13px' }}>{estoqueMsg}</div>}

              <form onSubmit={handleCadastrarProdutoEstoque} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                  Título do Produto / Edição
                  <input type="text" placeholder="Ex: Encrenca 4 ou Zine Fotográfico" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                    Responsável / Proprietário
                    <select value={novoDonoId} onChange={e => setNovoDonoId(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                      <option value="">Coletivo (Encrenca)</option>
                      {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '13px', marginTop: '18px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={novoIsEdicao} 
                      onChange={e => setNovoIsEdicao(e.target.checked)} 
                      style={{ width: '18px', height: '18px', accentColor: '#8A41F6' }} 
                    />
                    É uma edição da Encrenca? (Destaque no Painel)
                  </label>
                </div>

                <button type="submit" style={{ background: '#C5FF27', border: '2px solid #000', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '2px 2px 0 #000' }}>Cadastrar Produto</button>
              </form>
            </div>

            {/* Transferência de Estoque com Quantidade e Local de Origem */}
            <div style={{ background: '#FFF', border: '2px solid #000', padding: '16px', borderRadius: '8px', marginBottom: '20px', maxWidth: '850px', boxShadow: '2px 2px 0 #000' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Transferir Produto/Estoque para Outro Responsável</h3>
              {transfMsg && <div style={{ padding: '8px', background: '#DCFCE7', color: '#166534', borderRadius: '4px', marginBottom: '10px', fontSize: '13px' }}>{transfMsg}</div>}

              <form onSubmit={handleTransferirEstoque} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                  Produto
                  <select value={transfEdicaoId} onChange={e => setTransfEdicaoId(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                    <option value="">Selecione...</option>
                    {d.edicoes?.map(e => {
                      const dono = d.pessoas?.find(p => String(p.id) === String(e.proprietario_id))?.nome || 'Coletivo (Encrenca)'
                      return <option key={e.id} value={e.id}>{e.titulo} (Dono: {dono})</option>
                    })}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                  Retirar do Local
                  <select value={transfOrigemLocalId} onChange={e => setTransfOrigemLocalId(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                    <option value="">Local Padrão / Central</option>
                    {d.locais?.map(l => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                  Novo Responsável
                  <select value={transfNovaPessoaId} onChange={e => setTransfNovaPessoaId(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                    <option value="">Coletivo (Encrenca)</option>
                    {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                  Qtd
                  <input type="number" min="1" value={transfQtd} onChange={e => setTransfQtd(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
                </label>

                <button type="submit" style={{ background: '#C5FF27', border: '2px solid #000', padding: '9px 14px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '2px 2px 0 #000' }}>
                  Transferir
                </button>
              </form>
            </div>

            {/* Filtros do Estoque */}
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>Estoque Atual de Produtos</h3>
            <div style={{ background: '#FFF', border: '2px solid #000', padding: '14px', borderRadius: '8px', marginBottom: '20px', maxWidth: '850px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                Responsável:
                <select value={filtroEstoqueDono} onChange={e => setFiltroEstoqueDono(e.target.value)} style={{ padding: '6px', border: '2px solid #000', borderRadius: '6px' }}>
                  <option value="todos">Todos</option>
                  <option value="coletivo">Coletivo (Encrenca)</option>
                  {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                Local:
                <select value={filtroEstoqueLocal} onChange={e => setFiltroEstoqueLocal(e.target.value)} style={{ padding: '6px', border: '2px solid #000', borderRadius: '6px' }}>
                  <option value="todos">Todos os Locais</option>
                  {d.locais?.map(l => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                Cadastrado De:
                <input type="date" value={filtroEstoqueDataInicio} onChange={e => setFiltroEstoqueDataInicio(e.target.value)} style={{ padding: '6px', border: '2px solid #000', borderRadius: '6px' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                Cadastrado Até:
                <input type="date" value={filtroEstoqueDataFim} onChange={e => setFiltroEstoqueDataFim(e.target.value)} style={{ padding: '6px', border: '2px solid #000', borderRadius: '6px' }} />
              </label>
            </div>

            {/* Tabela de Produtos Expansíveis */}
            <div className="table-container" style={{ maxWidth: '850px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produto / Edição</th>
                    <th>É Edição?</th>
                    <th>Responsável</th>
                    <th>Estoque Total</th>
                    <th>Data Cadastro</th>
                    <th style={{ textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {edicoesFiltradasEstoque.map(e => {
                    const dono = d.pessoas?.find(p => String(p.id) === String(e.proprietario_id))?.nome || 'Coletivo (Encrenca)'
                    const totalQtd = d.saldos?.filter(s => String(s.edicao_id) === String(e.id)).reduce((acc, curr) => acc + (curr.qtd || 0), 0) || 0
                    const expandido = !!produtosExpandidos[String(e.id)]

                    return (
                      <>
                        <tr key={e.id}>
                          <td><strong>{e.titulo}</strong></td>
                          <td>{e.is_edicao ? 'Sim' : 'Não'}</td>
                          <td>{dono}</td>
                          <td style={{ fontWeight: 'bold', color: totalQtd > 0 ? '#2F855A' : '#E53E3E' }}>{totalQtd} un</td>
                          <td>{e.created_at ? new Date(e.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              onClick={() => toggleProdutoExpandido(String(e.id))}
                              className="btn-action" 
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                            >
                              {expandido ? '- Recolher' : '+ Expandir'}
                            </button>
                          </td>
                        </tr>

                        {expandido && (
                          <tr key={`exp-${e.id}`} style={{ background: '#FAF7F0' }}>
                            <td colSpan={6} style={{ padding: '10px 16px' }}>
                              <div style={{ background: '#FFF', padding: '10px', border: '1px solid #000', borderRadius: '6px' }}>
                                <h4 style={{ fontSize: '12px', marginBottom: '8px' }}>Saldos por Local de Estoque:</h4>
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                  {d.locais?.map(loc => {
                                    const saldoLocal = d.saldos?.find(s => String(s.edicao_id) === String(e.id) && String(s.local_id) === String(loc.id))
                                    const qtdLoc = saldoLocal?.qtd || 0
                                    return (
                                      <div key={loc.id} style={{ border: '1px solid #CCC', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', background: '#FFF' }}>
                                        <strong>{loc.nome}:</strong> {qtdLoc} un
                                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                          <button onClick={() => handleAjustarEstoque(String(e.id), String(loc.id), -1)} style={{ padding: '1px 6px', background: '#FEE2E2', border: '1px solid #000', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>-1</button>
                                          <button onClick={() => handleAjustarEstoque(String(e.id), String(loc.id), 1)} style={{ padding: '1px 6px', background: '#DCFCE7', border: '1px solid #000', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>+1</button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                  {edicoesFiltradasEstoque.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#666' }}>Nenhum produto encontrado com os filtros selecionados.</td>
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
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>Registrar Repasse Financeiro</h2>
            {repasseMsg && <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #86EFAC' }}>{repasseMsg}</div>}

            <form onSubmit={handleSalvarRepasse} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '600px', background: '#FFF', border: '2px solid #000', padding: '18px', borderRadius: '8px', boxShadow: '2px 2px 0 #000' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Tipo / Fluxo do Repasse:
                <select value={origemRepasse} onChange={e => setOrigemRepasse(e.target.value as any)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px', background: '#FAF7F0', fontWeight: 'bold' }}>
                  <option value="coletivo_para_pessoa">Coletivo (Encrenca) ➔ Repassa para uma Pessoa</option>
                  <option value="pessoa_para_coletivo">Pessoa ➔ Repassa dinheiro ao Coletivo (Encrenca)</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Pessoa Beneficiária / Envolvida
                <select value={repassePessoaId} onChange={e => setRepassePessoaId(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }}>
                  <option value="">Selecione a pessoa</option>
                  {d.pessoas?.filter(p => p.ativa !== false).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome} (Saldo devido a ela: {fmtMoney(valoresDevidosPorPessoa[String(p.id)] || 0)})
                    </option>
                  ))}
                </select>
              </label>

              {repassePessoaId && (
                <div style={{ padding: '10px', background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold' }}>
                  A ser repassado pelo Coletivo (Encrenca) a esta pessoa: {fmtMoney(valoresDevidosPorPessoa[String(repassePessoaId)] || 0)}
                </div>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Valor do Repasse (R$)
                <input inputMode="decimal" placeholder="0,00" value={repasseValor} onChange={e => setRepasseValor(e.target.value)} required style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 'bold', fontSize: '13px' }}>
                Observação / Detalhes (opcional)
                <input placeholder="Ex: Pix relativo às vendas de zines da feira X" value={repasseObs} onChange={e => setRepasseObs(e.target.value)} style={{ padding: '8px', border: '2px solid #000', borderRadius: '6px' }} />
              </label>

              <button type="submit" style={{ background: '#C5FF27', border: '2px solid #000', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '2px 2px 0 #000', fontSize: '14px' }}>
                Salvar Repasse
              </button>
            </form>
          </div>
        )}

        {aba === 'venda' && <VendaForm d={d} onOk={carregar} />}
        {aba === 'cadastros' && <Cadastros d={d} onOk={carregar} />}
      </div>
    </div>
  )
}
