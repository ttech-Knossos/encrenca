import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { VendaForm } from './VendaForm'
import { Vendas, Repasses } from './Relatorios'
import { Cadastros, Estoque } from './Extras'

type Row = Record<string, any>
type Dados = Record<string, Row[]>

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [verificandoSessao, setVerificandoSessao] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginErro, setLoginErro] = useState('')
  const [carregandoLogin, setCarregandoLogin] = useState(false)

  const [aba, setAba] = useState<
    'home' | 'venda' | 'vendas' | 'repasses' | 'estoque' | 'cadastros'
  >('home')

  const [d, setD] = useState<Dados>({})
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!supabase) {
      setVerificandoSessao(false)
      return
    }

    let ativo = true

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) setLoginErro(error.message)
        setSession(data.session)
        setVerificandoSessao(false)
      })
      .catch((e: unknown) => {
        if (!ativo) return
        setLoginErro(
          e instanceof Error ? e.message : 'Não foi possível verificar a sessão.'
        )
        setVerificandoSessao(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, novaSession) => {
      if (!ativo) return
      setSession(novaSession)
      setVerificandoSessao(false)
    })

    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [])

  async function carregar() {
    if (!supabase) return

    const client = supabase

    const q = async (t: string): Promise<Row[]> => {
      const r = await client.from(t).select('*')
      if (r.error) throw r.error
      return (r.data ?? []) as Row[]
    }

    try {
      const [
        pessoas,
        edicoes,
        locais,
        saldos,
        fin,
        eventos,
        evento_produtos,
        vendas,
      ] = await Promise.all(
        [
          'pessoas',
          'edicoes',
          'locais',
          'v_saldos',
          'v_financeiro_pessoa',
          'eventos',
          'evento_produtos',
          'vendas',
        ].map(q)
      )

      setD({
        pessoas,
        edicoes,
        locais,
        saldos,
        fin,
        eventos,
        evento_produtos,
        vendas,
      })
      setErro('')
    } catch (e: unknown) {
      const mensagem = e instanceof Error
        ? e.message
        : (e as { message?: string })?.message ?? 'Falha desconhecida.'

      setErro('Erro ao carregar dados: ' + mensagem)
    }
  }

  useEffect(() => {
    if (session) {
      void carregar()
    } else {
      setD({})
      setErro('')
      setAba('home')
    }
  }, [session])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return

    setLoginErro('')
    setCarregandoLogin(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setLoginErro('Falha no login: ' + error.message)
      } else {
        setPassword('')
      }
    } catch {
      setLoginErro('Não foi possível entrar. Verifique sua conexão.')
    } finally {
      setCarregandoLogin(false)
    }
  }

  async function handleLogout() {
    if (!supabase) return

    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        setErro('Não foi possível sair: ' + error.message)
        return
      }

      setSession(null)
      setD({})
      setErro('')
      setPassword('')
      setAba('home')
    } catch {
      setErro('Não foi possível sair. Verifique sua conexão.')
    }
  }

  if (!supabase) {
    return (
      <div className="container">
        <h2>Configuração pendente</h2>
        <p>
          Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
          e faça um novo deploy.
        </p>
      </div>
    )
  }

  if (verificandoSessao) {
    return <div className="container">Carregando…</div>
  }

  if (!session) {
    return (
      <div
        className="container"
        style={{ maxWidth: '420px', marginTop: '60px' }}
      >
        <h2 style={{ marginBottom: '8px', textAlign: 'center' }}>
          Desencrenca Coletivo
        </h2>

        <p
          style={{
            color: '#718096',
            fontSize: '14px',
            textAlign: 'center',
            marginBottom: '20px',
          }}
        >
          Entre com seu e-mail e senha para acessar o painel
        </p>

        {loginErro && (
          <div className="erro" role="alert">
            {loginErro}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
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
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            className="btn-primary"
            disabled={carregandoLogin}
          >
            {carregandoLogin ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    )
  }

  const totalProdutosCadastrados = d.edicoes?.length ?? 0

  const totalSaldosEstoque = (d.saldos ?? []).reduce(
    (total, item) => total + Number(item.saldo ?? item.qtd ?? 0),
    0
  )

  const totalVendasRealizadas = d.vendas?.length ?? 0

  return (
    <div className="container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <span style={{ fontSize: '14px', color: '#4a5568' }}>
          Conectado como: <strong>{session.user.email}</strong>
        </span>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: 'auto',
            padding: '6px 14px',
            fontSize: '13px',
          }}
        >
          Sair
        </button>
      </div>

      <nav>
        <button
          onClick={() => setAba('home')}
          className={aba === 'home' ? 'ativo' : ''}
        >
          Home / Dashboard
        </button>

        <button
          onClick={() => setAba('venda')}
          className={aba === 'venda' ? 'ativo' : ''}
        >
          Registrar venda
        </button>

        <button
          onClick={() => setAba('vendas')}
          className={aba === 'vendas' ? 'ativo' : ''}
        >
          Vendas
        </button>

        <button
          onClick={() => setAba('repasses')}
          className={aba === 'repasses' ? 'ativo' : ''}
        >
          Registrar repasse
        </button>

        <button
          onClick={() => setAba('estoque')}
          className={aba === 'estoque' ? 'ativo' : ''}
        >
          Estoque
        </button>

        <button
          onClick={() => setAba('cadastros')}
          className={aba === 'cadastros' ? 'ativo' : ''}
        >
          Cadastros
        </button>
      </nav>

      {erro && (
        <div className="erro" role="alert">
          <p>{erro}</p>
          <button type="button" onClick={() => void carregar()}>
            Tentar novamente
          </button>
        </div>
      )}

      {aba === 'home' && (
        <div>
          <h2>Painel Geral</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              margin: '20px 0',
            }}
          >
            <div
              style={{
                background: '#f7fafc',
                border: '2px solid #000',
                padding: '16px',
                borderRadius: '8px',
                boxShadow: '2px 2px 0 #000',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  color: '#718096',
                  fontWeight: 'bold',
                }}
              >
                PRODUTOS CADASTRADOS
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  marginTop: '4px',
                }}
              >
                {totalProdutosCadastrados}
              </div>
            </div>

            <div
              style={{
                background: '#f0fff4',
                border: '2px solid #000',
                padding: '16px',
                borderRadius: '8px',
                boxShadow: '2px 2px 0 #000',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  color: '#276749',
                  fontWeight: 'bold',
                }}
              >
                TOTAL EM ESTOQUE
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: '#2f855a',
                  marginTop: '4px',
                }}
              >
                {totalSaldosEstoque} un
              </div>
            </div>

            <div
              style={{
                background: '#ebf8ff',
                border: '2px solid #000',
                padding: '16px',
                borderRadius: '8px',
                boxShadow: '2px 2px 0 #000',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  color: '#2b6cb0',
                  fontWeight: 'bold',
                }}
              >
                VENDAS REGISTRADAS
              </div>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 'bold',
                  color: '#2b6cb0',
                  marginTop: '4px',
                }}
              >
                {totalVendasRealizadas}
              </div>
            </div>
          </div>

          <h3>Resumo de Estoque dos Produtos</h3>

          <div style={{ overflowX: 'auto' }}>
            <table className="tabela-resumo">
              <thead>
                <tr>
                  <th>Edição / Produto</th>
                  <th>Locais com estoque</th>
                  <th>Preço sugerido</th>
                  <th>Saldo em Estoque</th>
                </tr>
              </thead>

              <tbody>
                {d.edicoes?.map(x => {
                  const saldos = (d.saldos ?? []).filter(
                    s => String(s.edicao_id) === String(x.id)
                  )

                  const saldo = saldos.reduce(
                    (total, s) =>
                      total + Number(s.saldo ?? s.qtd ?? 0),
                    0
                  )

                  const locais = saldos
                    .filter(s => Number(s.saldo ?? s.qtd ?? 0) > 0)
                    .map(s => {
                      const local = d.locais?.find(
                        l => String(l.id) === String(s.local_id)
                      )
                      return local?.nome ?? 'Local não identificado'
                    })

                  const preco = (
                    Number(x.preco_sugerido_centavos ?? 0) / 100
                  ).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })

                  return (
                    <tr key={x.id}>
                      <td>{x.titulo ?? x.nome ?? 'Sem título'}</td>
                      <td>
                        {[...new Set(locais)].join(', ') || 'Sem estoque'}
                      </td>
                      <td>{preco}</td>
                      <td>{saldo} un</td>
                    </tr>
                  )
                })}

                {!d.edicoes?.length && (
                  <tr>
                    <td colSpan={4}>Nenhum produto cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === 'venda' && (
        <VendaForm d={d} onOk={carregar} />
      )}

      {aba === 'vendas' && (
        <Vendas d={d} onOk={carregar} />
      )}

      {aba === 'repasses' && (
        <Repasses d={d} onOk={carregar} />
      )}

      {aba === 'estoque' && (
        <Estoque d={d} onOk={carregar} />
      )}

      {aba === 'cadastros' && (
        <Cadastros d={d} onOk={carregar} />
      )}
    </div>
  )
}
