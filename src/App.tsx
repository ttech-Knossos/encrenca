import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { VendaForm } from './VendaForm'
import { Vendas, Repasses } from './Relatorios'
import { Cadastros, Estoque } from './Extras'

type Row = Record<string, any>
type Dados = Record<string, Row[]>

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginErro, setLoginErro] = useState('')
  const [carregandoLogin, setCarregandoLogin] = useState(false)

  const [aba, setAba] = useState<'home' | 'venda' | 'vendas' | 'repasses' | 'estoque' | 'cadastros'>('home')
  const [d, setD] = useState<Dados>({})
  const [erro, setErro] = useState('')

  // Monitora a sessão de autenticação do Supabase
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
      const [pessoas, edicoes, locais, saldos, fin, eventos, evento_produtos, vendas] = await Promise.all([
        'pessoas', 'edicoes', 'locais', 'v_saldos', 'v_financeiro_pessoa', 'eventos', 'evento_produtos', 'vendas'
      ].map(q))
      setD({ pessoas, edicoes, locais, saldos, fin, eventos, evento_produtos, vendas }); setErro('')
    } catch (e: any) { setErro('Erro ao carregar dados: ' + e.message) }
  }

  useEffect(() => {
    if (session) {
      carregar()
    }
  }, [session])

  // Login com E-mail e Senha no Supabase Auth
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginErro('')
    setCarregandoLogin(true)

    const { error } = await supabase!.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setLoginErro('Falha no login: ' + error.message)
    }
    setCarregandoLogin(false)
  }

  async function handleLogout() {
    await supabase!.auth.signOut()
    setSession(null)
  }

  // TELA DE LOGIN ORIGINAL (COM E-MAIL E SENHA)
  if (!session) {
    return (
      <div className="container" style={{ maxWidth: '420px', marginTop: '60px' }}>
        <h2 style={{ marginBottom: '8px', textAlign: 'center' }}>Desencrenca Coletivo</h2>
        <p style={{ color: '#718096', fontSize: '14px', textAlign: 'center', marginBottom: '20px' }}>
          Entre com seu e-mail e senha para acessar o painel
        </p>

        {loginErro && <div className="erro" role="alert">{loginErro}</div>}

        <form onSubmit={handleLogin}>
          <label>
            E-mail
            <input 
              type="email" 
              placeholder="seu@email.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
            />
          </label>

          <label>
            Senha
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </label>

          <button type="submit" className="btn-primary" disabled={carregandoLogin}>
            {carregandoLogin ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    )
  }

  if (erro) return <div className="container"><div className="erro" role="alert">{erro}</div></div>

  // Cálculos do Dashboard / Home
  const totalProdutosCadastrados = d.edicoes?.length || 0
  const totalSaldosEstoque = d.saldos?.reduce((acc, curr) => acc + (curr.qtd || 0), 0) || 0
  const totalVendasRealizadas = d.vendas?.length || 0

  return (
    <div className="container">
      {/* Cabeçalho do App */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px', color: '#4a5568' }}>Conectado como: <strong>{session.user.email}</strong></span>
        <button onClick={handleLogout} style={{ width: 'auto', padding: '6px 14px', fontSize: '13px' }}>Sair</button>
      </div>

      {/* Menu Superior com todas as abas */}
      <nav>
        <button onClick={() => setAba('home')} className={aba === 'home' ? 'ativo' : ''}>Home / Dashboard</button>
        <button onClick={() => setAba('venda')} className={aba === 'venda' ? 'ativo' : ''}>Registrar venda</button>
        <button onClick={() => setAba('vendas')} className={aba === 'vendas' ? 'ativo' : ''}>Vendas</button>
        <button onClick={() => setAba('repasses')} className={aba === 'repasses' ? 'ativo' : ''}>Registrar repasse</button>
        <button onClick={() => setAba('estoque')} className={aba === 'estoque' ? 'ativo' : ''}>Estoque</button>
        <button onClick={() => setAba('cadastros')} className={aba === 'cadastros' ? 'ativo' : ''}>Cadastros</button>
      </nav>

      {/* ABA HOME / DASHBOARD COM CARDS E TABELA */}
      {aba === 'home' && (
        <div>
          <h2>Painel Geral</h2>

          {/* Cards de Métricas Principais */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
            gap: '16px', 
            margin: '20px 0' 
          }}>
            <div style={{ background: '#f7fafc', border: '2px solid #000', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 #000' }}>
              <div style={{ fontSize: '13px', color: '#718096', fontWeight: 'bold' }}>PRODUTOS CADASTRADOS</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '4px' }}>{totalProdutosCadastrados}</div>
            </div>

            <div style={{ background: '#f0fff4', border: '2px solid #000', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 #000' }}>
              <div style={{ fontSize: '13px', color: '#276749', fontWeight: 'bold' }}>TOTAL EM ESTOQUE</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2f855a', marginTop: '4px' }}>{totalSaldosEstoque} un</div>
            </div>

            <div style={{ background: '#ebf8ff', border: '2px solid #000', padding: '16px', borderRadius: '8px', boxShadow: '2px 2px 0 #000' }}>
              <div style={{ fontSize: '13px', color: '#2b6cb0', fontWeight: 'bold' }}>VENDAS REGISTRADAS</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2b6cb0', marginTop: '4px' }}>{totalVendasRealizadas}</div>
            </div>
          </div>

          {/* Tabela Resumo do Estoque por Produto */}
          <h3>Resumo de Estoque dos Produtos</h3>
          <table className="tabela-resumo">
            <thead>
              <tr>
                <th>Edição / Produto</th>
                <th>Proprietário</th>
                <th>Preço</th>
                <th>Saldo em Estoque</th>
              </tr>
            </thead>
            <tbody>
              {d.edicoes?.map(x => {
                const dono = d.pessoas?.find(p => String(p.id) === String(x
