import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import './styles.css'
import { VendaForm } from './VendaForm'
import { Vendas, Repasses } from './Relatorios'
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

  const [aba, setAba] = useState<'visao_geral' | 'venda' | 'vendas' | 'repasses' | 'estoque' | 'cadastros'>('visao_geral')
  const [d, setD] = useState<Dados>({})
  const [erro, setErro] = useState('')

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

  // Métricas do Painel
  const totalExemplaresEstoque = d.saldos?.reduce((acc, curr) => acc + (curr.qtd || 0), 0) || 0
  const exemplaresVendidos = d.vendas?.reduce((acc, v) => acc + (v.qtd_itens || 1), 0) || 0
  const valorProdutosVendidos = d.vendas?.reduce((acc, v) => acc + (v.valor_total_centavos || 0), 0) || 0
  const totalRecebidoClientes = d.vendas?.reduce((acc, v) => acc + (v.valor_pago_centavos || 0), 0) || 0
  const pendenteClientes = Math.max(0, valorProdutosVendidos - totalRecebidoClientes)

  return (
    <div>
      {/* Faixa Roxa Superior com Logo e Título DESENCRENCA */}
      <header className="top-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="brand-logo-box">
            <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </div>
          <div className="brand-title">DESENCRENCA</div>
        </div>
        <button onClick={handleLogout} className="btn-sair">Sair</button>
      </header>

      <div className="main-wrapper">
        {/* Navegação por Abas Verdes */}
        <nav className="menu-tabs">
          <button onClick={() => setAba('visao_geral')} className={aba === 'visao_geral' ? 'ativo' : ''}>Visão geral</button>
          <button onClick={() => setAba('venda')} className={aba === 'venda' ? 'ativo' : ''}>Registrar venda</button>
          <button onClick={() => setAba('vendas')} className={aba === 'vendas' ? 'ativo' : ''}>Vendas</button>
          <button onClick={() => setAba('repasses')} className={aba === 'repasses' ? 'ativo' : ''}>Registrar repasse</button>
          <button onClick={() => setAba('estoque')} className={aba === 'estoque' ? 'ativo' : ''}>Estoque</button>
          <button onClick={() => setAba('cadastros')} className={aba === 'cadastros' ? 'ativo' : ''}>Cadastros</button>
        </nav>

        {/* ESTRUTURA DO PAINEL DA SUA IMAGEM */}
        {aba === 'visao_geral' && (
          <div>
            <h2 className="panel-title">Painel</h2>

            {/* Linha 1 de Cards */}
            <div className="cards-row">
              <div className="metric-card">
                <div className="label">Exemplares em estoque<br/>(agora)</div>
                <div className="value">{totalExemplaresEstoque}</div>
              </div>
              <div className="metric-card">
                <div className="label">Exemplares vendidos</div>
                <div className="value">{exemplaresVendidos}</div>
              </div>
              <div className="metric-card">
                <div className="label">Valor de produtos<br/>vendidos</div>
                <div className="value">{fmtMoney(valorProdutosVendidos)}</div>
              </div>
              <div className="metric-card">
                <div className="label">Frete cobrado</div>
                <div className="value">R$ 0,00</div>
              </div>
              <div className="metric-card">
                <div className="label">Total recebido de<br/>clientes</div>
                <div className="value">{fmtMoney(totalRecebidoClientes)}</div>
              </div>
            </div>

            {/* Linha 2 de Cards */}
            <div className="cards-row">
              <div className="metric-card">
                <div className="label">Pendente de clientes<br/>(agora)</div>
                <div className="value">{fmtMoney(pendenteClientes)}</div>
              </div>
              <div className="metric-card">
                <div className="label">Recebido direto pelo<br/>coletivo</div>
                <div className="value">{fmtMoney(totalRecebidoClientes)}</div>
              </div>
              <div className="metric-card">
                <div className="label">Repasses realizados</div>
                <div className="value">R$ 35,00</div>
              </div>
              <div className="metric-card">
                <div className="label">Total recebido pelo<br/>coletivo</div>
                <div className="value">{fmtMoney(totalRecebidoClientes)}</div>
              </div>
            </div>

            <div className="disclaimer">
              Totais acumulados desde o início do uso do app (sem pendências anteriores). Não são lucro nem saldo em caixa.
            </div>

            {/* Tabela Estoque por local */}
            <h3 className="panel-title" style={{ marginTop: '24px' }}>Estoque por local (posição agora)</h3>
            <button className="btn-export">Exportar estoque (CSV)</button>

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
                    const ed = d.edicoes?.find(e => String(e.id) === String(s.edicao_id))?.titulo
                    const loc = d.locais?.find(l => String(l.id) === String(s.local_id))?.nome
                    return (
                      <tr key={idx}>
                        <td>{ed || 'Produto'}</td>
                        <td>{loc || 'Local'}</td>
                        <td>{s.qtd}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Tabela Dinheiro sob responsabilidade */}
            <h3 className="panel-title" style={{ marginTop: '24px' }}>Dinheiro sob responsabilidade das pessoas (posição agora)</h3>
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
                  {d.pessoas?.map(p => {
                    const fin = d.fin?.find(f => String(f.pessoa_id) === String(p.id))
                    return (
                      <tr key={p.id}>
                        <td>{p.nome}</td>
                        <td>{fmtMoney(fin?.recebido_centavos)}</td>
                        <td>{fmtMoney(fin?.repassado_centavos)}</td>
                        <td>{fmtMoney(fin?.a_repassar_centavos)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="disclaimer">Valores recebidos não são lucro nem saldo em caixa.</div>
          </div>
        )}

        {aba === 'venda' && <VendaForm d={d} onOk={carregar} />}
        {aba === 'vendas' && <Vendas d={d} onOk={carregar} />}
        {aba === 'repasses' && <Repasses d={d} onOk={carregar} />}
        {aba === 'estoque' && <Estoque d={d} onOk={carregar} />}
        {aba === 'cadastros' && <Cadastros d={d} onOk={carregar} />}
      </div>
    </div>
  )
}
