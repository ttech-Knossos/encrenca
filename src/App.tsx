import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { VendaForm } from './VendaForm'
import { Cadastros } from './Extras'

type Row = Record<string, any>
type Dados = Record<string, Row[]>

export default function App() {
  const [aba, setAba] = useState<'venda' | 'cadastros'>('venda')
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

  if (erro) return <div className="container"><div className="erro" role="alert">{erro}</div></div>

  return (
    <div className="container">
      <nav style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
        <button 
          onClick={() => setAba('venda')} 
          style={{ 
            fontWeight: aba === 'venda' ? 'bold' : 'normal',
            background: aba === 'venda' ? '#a3e635' : '#edf2f7',
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #000',
            cursor: 'pointer'
          }}
        >
          Registrar venda
        </button>
        <button 
          onClick={() => setAba('cadastros')} 
          style={{ 
            fontWeight: aba === 'cadastros' ? 'bold' : 'normal',
            background: aba === 'cadastros' ? '#a3e635' : '#edf2f7',
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #000',
            cursor: 'pointer'
          }}
        >
          Cadastros & Produtos
        </button>
      </nav>

      {aba === 'venda' && <VendaForm d={d} onOk={carregar} />}
      {aba === 'cadastros' && <Cadastros d={d} onOk={carregar} />}
    </div>
  )
}
