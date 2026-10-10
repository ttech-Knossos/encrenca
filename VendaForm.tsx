import { useState } from 'react'
import { useEnvio, Aviso } from './envio'
type Row = Record<string, any>; type Dados = Record<string, Row[]>
const cents = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100)
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const item0 = { ed: '', orig: '', qtd: '1', preco: '', desc: '' }
const vazio = () => ({ resp: '', canal: 'feira', data: hoje(), evento: '', itens: [{ ...item0 }], pago: '', dest: 'coletivo', meio: 'pix', fr: '', frc: '', frp: '', obs: '' })
export function VendaForm({ d, onOk }: { d: Dados; onOk: () => void }) {
  const [f, setF] = useState(vazio()); const { msg, erro, env, enviar, incerto, descartar } = useEnvio(onOk)
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value })
  const setIt = (i: number, k: string, v: string) => setF({ ...f, itens: f.itens.map((x, j) => j === i ? { ...x, [k]: v, ...(k === 'ed' ? { preco: ((d.edicoes?.find(e => e.id === v)?.preco_sugerido_centavos ?? 0) / 100).toFixed(2).replace('.', ',') } : {}) } : x) })
  const sel = (v: string, on: (v: string) => void, l: Row[] | undefined, k = 'nome') => <select value={v} onChange={e => on(e.target.value)} required><option value="">Selecione</option>{l?.map(x => <option key={x.id} value={x.id}>{x[k]}</option>)}</select>
  function submit(e: React.FormEvent) {
    e.preventDefault(); const pago = f.pago ? cents(f.pago) : 0
    enviar('registrar_venda', { responsavel_id: f.resp, em_nome_de: f.resp, canal: f.canal, data: f.data, evento_id: f.evento, obs: f.obs,
      itens: f.itens.map(i => ({ edicao_id: i.ed, origem_id: i.orig, qtd: +i.qtd, preco_centavos: cents(i.preco), desconto_centavos: i.desc ? cents(i.desc) : 0 })),
      frete_cobrado_centavos: f.fr ? cents(f.fr) : 0, frete_custo_centavos: f.frc === '' ? '' : cents(f.frc), frete_pago_por: f.frp,
      recebimentos: pago > 0 ? [{ valor_centavos: pago, meio: f.meio, data: f.data, destino: f.dest === 'coletivo' ? 'coletivo' : 'pessoa', pessoa_id: f.dest === 'coletivo' ? null : f.dest }] : [] }).then(ok => ok && setF(vazio()))
  }
  return <form onSubmit={submit}><h2>Registrar venda</h2>
    <label>Quem vendeu{sel(f.resp, v => setF({ ...f, resp: v }), d.pessoas?.filter(p => p.ativa))}</label>
    {f.itens.map((i, n) => <fieldset key={n}><legend>Item {n + 1}</legend>
      <label>Edição{sel(i.ed, v => setIt(n, 'ed', v), d.edicoes?.filter(x => x.ativa !== false), 'titulo')}</label>
      <label>Sai do estoque de{sel(i.orig, v => setIt(n, 'orig', v), d.locais)}</label>
      <label>Quantidade<input inputMode="numeric" value={i.qtd} onChange={e => setIt(n, 'qtd', e.target.value)} required /></label>
      <label>Preço cobrado (R$)<input inputMode="decimal" value={i.preco} onChange={e => setIt(n, 'preco', e.target.value)} required /></label>
      <label>Desconto no item (R$, opcional)<input inputMode="decimal" value={i.desc} onChange={e => setIt(n, 'desc', e.target.value)} /></label>
      {f.itens.length > 1 && <button type="button" onClick={() => setF({ ...f, itens: f.itens.filter((_, j) => j !== n) })}>Remover item</button>}</fieldset>)}
    <button type="button" onClick={() => setF({ ...f, itens: [...f.itens, { ...item0 }] })}>+ Outro item</button>
    <label>Valor recebido agora (R$)<input inputMode="decimal" value={f.pago} onChange={set('pago')} /></label>
    <label>Quem recebeu<select value={f.dest} onChange={set('dest')}><option value="coletivo">Coletivo</option>{d.pessoas?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
    <details><summary>Mais detalhes (data, canal, evento, frete, observação)</summary>
      <label>Data<input type="date" value={f.data} onChange={set('data')} required /></label>
      <label>Canal<select value={f.canal} onChange={set('canal')}>{['direta', 'feira', 'evento', 'site', 'outro'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Feira/evento<select value={f.evento} onChange={set('evento')}><option value="">Nenhum</option>{d.eventos?.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
      <label>Forma do pagamento<select value={f.meio} onChange={set('meio')}>{['pix', 'dinheiro', 'cartao', 'transferencia', 'outro'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Frete cobrado do comprador (R$)<input inputMode="decimal" value={f.fr} onChange={set('fr')} /></label>
      <label>Custo do envio (R$) — vazio = ainda não sei, 0 = custo zero<input inputMode="decimal" value={f.frc} onChange={set('frc')} /></label>
      <label>Quem pagou o envio<select value={f.frp} onChange={set('frp')}><option value="">Ninguém / não pago</option>{d.pessoas?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
      <label>Observações<input value={f.obs} onChange={set('obs')} /></label></details>
    <Aviso erro={erro} incerto={incerto} descartar={descartar} />{msg && <div className="ok" role="status">{msg}</div>}
    <button disabled={env}>{env ? 'Salvando…' : 'Salvar venda'}</button></form>
}
