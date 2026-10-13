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
  const [mostrarEstoqueProduto, setMostrarEstoqueProduto] = useState(false)
  const [mostrarDinheiroPessoas, setMostrarDinheiroPessoas] = useState(false)
  const [mostrarProdsResponsavel, setMostrarProdsResponsavel] = useState(false)

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

  // Transferência de Estoque
  const [transfEdicaoId, setTransfEdicaoId] = useState('')
  const [transfNovaPessoaId, setTransfNovaPessoaId] = useState('')
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
        titulo: novo
