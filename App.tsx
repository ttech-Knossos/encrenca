import logoImg from './logo.png'
import { useEffect, useState } from 'react'
import { useEnvio, Aviso } from './envio'
import { Cadastros, Estoque } from './Extras'
import { baixar } from './csv'
import { Painel, Vendas, Repasses } from './Vendas'
import { VendaForm } from './VendaForm'
import { supabase } from './supabase'

type Row = Record<string, any>
type Dados = Record<string, Row[]>
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const cents = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100)

export default function App() {
  const [logado, setLogado] = useState<boolean | null>(null)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setLogado(!!data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setLogado(!!s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!supabase) return <main><h1>Configuração pendente</h1><p>Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja README).</p></main>
  if (logado === null) return <main>Carregando…</main>
  return logado ? <Shell /> : <Login />
}

function Login() {
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState(''); const [erro, setErro] = useState('')
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErro('')
    const { error } = await supabase!.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('Não foi possível entrar. Confira e-mail e senha.')
  }
  return <main><h1>Desencrenca</h1><form onSubmit={entrar}>
    <label>E-mail do coletivo<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
    <label>Senha<input type="password" value={senha} onChange={e => setSenha(e.target.value)} required /></label>
    {erro && <div className="erro" role="alert">{erro}</div>}<button>Entrar</button></form></main>
}

function Shell() {
  const [aba, setAba] = useState<'geral' | 'venda' | 'vendas' | 'repasse' | 'estoque' | 'cadastros'>('geral')
  const [d, setD] = useState<Dados>({}); const [erro, setErro] = useState('')
  async function carregar() {
    const q = async (t: string) => { const r = await supabase!.from(t).select('*'); if (r.error) throw r.error; return r.data as Row[] }
    try {
      const [pessoas, edicoes, locais, saldos, fin, eventos] = await Promise.all(['pessoas', 'edicoes', 'locais', 'v_saldos', 'v_financeiro_pessoa', 'eventos'].map(q))
      setD({ pessoas, edicoes, locais, saldos, fin, eventos }); setErro('')
    } catch (e: any) { setErro('Erro ao carregar dados: ' + e.message) }
  }
  useEffect(() => { carregar() }, [])
  const nome = (lista: string, id: string) => { const x = d[lista]?.find(r => r.id === id); return x?.nome ?? x?.titulo ?? '—' }
  const rot = { geral: 'Visão geral', venda: 'Registrar venda', vendas: 'Vendas', repasse: 'Registrar repasse', estoque: 'Estoque', cadastros: 'Cadastros' }
  return <>
    <header>
      <div className="logo" aria-label="Logo do coletivo">
        <img src={logoImg} alt="Desencrenca" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
      </div>
      <h1>DESENCRENCA</h1>
      <button onClick={() => supabase!.auth.signOut()}>Sair</button>
    </header>
    <nav>{(['geral', 'venda', 'vendas', 'repasse', 'estoque', 'cadastros'] as const).map(a => <button key={a} aria-current={aba === a} onClick={() => setAba(a)}>{rot[a]}</button>)}</nav>
    <main>{erro && <div className="erro" role="alert">{erro}</div>}
      {aba === 'geral' && <>
        <h2>Painel</h2><Painel key={JSON.stringify(d.fin)} />
        <h2>Estoque por local (posição agora)</h2>
        <button onClick={() => baixar('estoque.csv', ['Edição', 'Local', 'Exemplares'], (d.saldos ?? []).map(s => [nome('edicoes', s.edicao_id), nome('locais', s.local_id), s.saldo]))}>Exportar estoque (CSV)</button>
        {d.saldos?.length ? <table><thead><tr><th>Edição</th><th>Local</th><th>Exemplares</th></tr></thead><tbody>
          {d.saldos.map((s, i) => <tr key={i}><td>{nome('edicoes', s.edicao_id)}</td><td>{nome('locais', s.local_id)}</td><td>{s.saldo}</td></tr>)}</tbody></table>
          : <p>Nenhum estoque lançado ainda.</p>}
        <h2>Dinheiro sob responsabilidade das pessoas (posição agora)</h2>
        <table><thead><tr><th>Pessoa</th><th>Recebido</th><th>Repassado</th><th>A repassar</th></tr></thead><tbody>
          {d.fin?.map(f => <tr key={f.pessoa_id}><td>{f.nome}</td><td>{brl(f.recebido)}</td><td>{brl(f.repassado)}</td><td>{brl(f.recebido - f.repassado)}</td></tr>)}</tbody></table>
        <p className="nota">Valores recebidos não são lucro nem saldo em caixa.</p></>}
      {aba === 'venda' && <VendaForm d={d} onOk={carregar} />}
      {aba === 'vendas' && <Vendas d={d} onOk={carregar} />}
      {aba === 'repasse' && <><Repasse d={d} onOk={carregar} /><Repasses d={d} onOk={carregar} /></>}
      {aba === 'estoque' && <Estoque d={d} onOk={carregar} />}
      {aba === 'cadastros' && <Cadastros d={d} onOk={carregar} />}
    </main></>
}

function Repasse({ d, onOk }: { d: Dados; onOk: () => void }) {
  const [pessoa, setPessoa] = useState(''); const [valor, setValor] = useState('')
  const { msg, erro, env, enviar, incerto, descartar } = useEnvio(onOk)
  return <form onSubmit={e => { e.preventDefault(); enviar('registrar_repasse', { pessoa_id: pessoa, valor_centavos: cents(valor), em_nome_de: pessoa }).then(ok => { if (ok) setValor('') }) }}>
    <h2>Registrar repasse</h2>
    <label>Quem transferiu<select value={pessoa} onChange={e => setPessoa(e.target.value)} required><option value="">Selecione</option>{d.pessoas?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
    <label>Valor (R$)<input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} required /></label>
    <Aviso erro={erro} incerto={incerto} descartar={descartar} />{msg && <div className="ok" role="status">{msg}</div>}
    <button disabled={env}>{env ? 'Salvando…' : 'Salvar repasse'}</button></form>
}
