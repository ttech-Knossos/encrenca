import { useRef, useState } from 'react'
import { supabase } from './supabase'
export function Aviso({ erro, incerto, descartar }: { erro: string; incerto: boolean; descartar: () => void }) {
  return erro ? <div className="erro" role="alert">{erro}{incerto && <> <button type="button" onClick={descartar}>Descartar tentativa e começar nova</button></>}</div> : null
}
// op_id fixo por tentativa. Se a rede falhar (resultado incerto), o conteúdo não pode mudar com o mesmo op_id.
export function useEnvio(onOk: () => void) {
  const op = useRef(crypto.randomUUID()); const tent = useRef<string | null>(null)
  const [msg, setMsg] = useState(''); const [erro, setErro] = useState(''); const [env, setEnv] = useState(false); const [incerto, setIncerto] = useState(false)
  function descartar() { op.current = crypto.randomUUID(); tent.current = null; setIncerto(false); setErro('') }
  async function enviar(fn: string, payload: Record<string, any>): Promise<boolean> {
    const corpo = JSON.stringify(payload)
    if (incerto && tent.current !== corpo) { setErro('A tentativa anterior pode ter sido gravada. Confira os registros ou descarte a tentativa.'); return false }
    setEnv(true); setMsg(''); setErro('')
    try {
      const { error, status } = await supabase!.rpc(fn, { p: { ...payload, op_id: op.current } })
      if (error) {
        if (status === 0 || !(error as any).code) { tent.current = corpo; setIncerto(true); setErro('Sem conexão: não sei se foi registrado. Tente de novo com os mesmos dados.'); return false }
        setErro(error.message); return false } // erro do banco: nada foi gravado
      op.current = crypto.randomUUID(); tent.current = null; setIncerto(false); setMsg('Registrado com sucesso.'); onOk(); return true
    } catch { tent.current = corpo; setIncerto(true); setErro('Sem conexão: não sei se foi registrado. Tente de novo com os mesmos dados.'); return false }
    finally { setEnv(false) }
  }
  return { msg, erro, env, enviar, incerto, descartar }
}
