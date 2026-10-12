import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { VendaForm } from './VendaForm'
import { Cadastros, Estoque } from './Extras'

type Row = Record<string, any>
type Dados = Record<string, Row[]>

export default function App() {
  const [autenticado, setAutenticado] = useState(false)
  const [senha, setSenha] = useState('')
  const [aba, setAba] = useState<'home' | 'venda' | 'estoque' | 'cadastros'>('home')
  const [d, setD] = useState<Dados>({})
  const [erro, setErro] = useState('')

  async function carregar() {
    const q = async (t: string) => { 
      const r = await supabase!.from(t).select('*'); 
      if (r.error) throw r.error; 
      return r.data as Row[] 
    }
    try {
      const [pessoas, edicoes, locais, saldos, fin, eventos, evento_produtos] = await Promise.all([
        'pessoas', 'edicoes', 'locais', 'v_saldos', 'v_financeiro_pessoa', 'eventos', 'evento_produtos'
      ].map(q))
      setD({ pessoas, edicoes, locais, saldos, fin, eventos, evento_produtos }); setErro('')
    } catch (e: any) { setErro('Erro ao carregar dados: ' + e.message) }
  }

  useEffect(() => { carregar() }, [])

  function fazerLogin(e: React.FormEvent) {
    e.preventDefault()
    // Pode alterar ou remover a verificação conforme sua preferência
    setAutenticado(true)
  }

  if (!autenticado) {
    return (
      <div className="container" style={{ maxWidth: '400px', marginTop: '60px' }}>
        <h2>Painel Coletivo Desencrenca</h2>
        <form onSubmit={fazerLogin} style={{ marginTop: '16px' }}>
          <label>
            Acesso ao Sistema
            <input 
              type="password" 
              placeholder="Digite sua senha de acesso" 
              value={senha} 
              onChange={e => setSenha(e.target.value)} 
            />
          </label>
          <button type="submit" className="btn-primary">Entrar no Painel</button>
        </form>
      </div>
    )
  }

  if (erro) return <div className="container"><div className="erro" role="alert">{erro}</div></div>

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '20px' }}>Desencrenca App</h1>
        <button onClick={() => setAutenticado(false)} style={{ width: 'auto', padding: '4px 12px', fontSize: '13px' }}>Sair</button>
      </div>

      <nav>
        <button onClick={() => setAba('home')} className={aba === 'home' ? 'ativo' : ''}>Home / Painel</button>
        <button onClick={() => setAba('venda')} className={aba === 'venda' ? 'ativo' : ''}>Registrar venda</button>
        <button onClick={() => setAba('estoque')} className={aba === 'estoque' ? 'ativo' : ''}>Movimentar Estoque</button>
        <button onClick={() => setAba('cadastros')} className={aba === 'cadastros' ? 'ativo' : ''}>Cadastros & Produtos</button>
      </nav>

      {aba === 'home' && (
        <div>
          <h2>Painel Principal</h2>
          <p style={{ color: '#4a5568', margin: '8px 0 16px 0' }}>Resumo de edições e saldos de estoque atuais:</p>
          
          <h3>Resumo do Estoque</h3>
          <table className="tabela-resumo">
            <thead>
              <tr>
                <th>Produto / Edição</th>
                <th>Proprietário</th>
                <th>Preço</th>
                <th>Saldo Disponível</th>
              </tr>
            </thead>
            <tbody>
              {d.edicoes?.map(x => {
                const dono = d.pessoas?.find(p => String(p.id) === String(x.proprietario_id))?.nome || 'Coletivo'
                const saldoCalculado = d.saldos?.filter(s => String(s.edicao_id) === String(x.id)).reduce((acc, curr) => acc + (curr.qtd || 0), 0) ?? 0

                return (
                  <tr key={x.id}>
                    <td><strong>{x.titulo}</strong> {x.numero ? `(#${x.numero})` : ''}</td>
                    <td>{dono}</td>
                    <td>R$ {((x.preco_sugerido_centavos ?? 0) / 100).toFixed(2).replace('.', ',')}</td>
                    <td style={{ fontWeight: 'bold', color: saldoCalculado > 0 ? '#2b6cb0' : '#e53e3e' }}>{saldoCalculado} un</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {aba === 'venda' && <VendaForm d={d} onOk={carregar} />}
      {aba === 'estoque' && <Estoque d={d} onOk={carregar} />}
      {aba === 'cadastros' && <Cadastros d={d} onOk={carregar} />}
    </div>
  )
}
