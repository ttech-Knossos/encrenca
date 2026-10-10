import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useEnvio, Aviso } from './envio'
import { baixar } from './csv'
type Row = Record<string, any>; type Dados = Record<string, Row[]>
export const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const cents = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100)
const nm = (d: Dados, l: string, id: string) => { const x = d[l]?.find(r => r.id === id); return x?.nome ?? x?.titulo ?? '—' }

export function Painel() {
  const [p, setP] = useState<Row | null>(null); const [erro, setErro] = useState('')
  useEffect(() => { supabase!.from('v_painel').select('*').single().then(r => r.error ? setErro(r.error.message) : setP(r.data), () => setErro('Sem conexão.')) }, [])
  if (erro) return <div className="erro" role="alert">{erro}</div>; if (!p) return <p>Carregando…</p>
  const c: [string, string][] = [['Exemplares em estoque (agora)', String(p.estoque)], ['Exemplares vendidos', String(p.vendidos)], ['Valor de produtos vendidos', brl(p.produtos)], ['Frete cobrado', brl(p.frete)],
    ['Total recebido de clientes', brl(p.recebido_clientes)], ['Pendente de clientes (agora)', brl(p.pendente_clientes)], ['Recebido direto pelo coletivo', brl(p.recebido_direto)],
    ['Repasses realizados', brl(p.repassado)], ['Total recebido pelo coletivo', brl(p.recebido_direto + p.repassado)]]
  return <div className="cards">{c.map(([t, v]) => <div className="card" key={t}><small>{t}</small><strong>{v}</strong></div>)}
    <p className="nota">Totais acumulados desde o início do uso do app (sem pendências anteriores). Não são lucro nem saldo em caixa.</p></div>
}

export function Vendas({ d, onOk }: { d: Dados; onOk: () => void }) {
  const [rows, setRows] = useState<Row[]>([]); const [erro, setErro] = useState(''); const [ab, setAb] = useState<string | null>(null)
  const [fl, setFl] = useState({ de: '', ate: '', canal: '', resp: '', evento: '', ed: '' }); const [its, setIts] = useState<Row[]>([])
  async function carregar() { try { const [r, q] = await Promise.all([supabase!.from('v_vendas_resumo').select('*').order('data', { ascending: false }), supabase!.from('venda_itens').select('venda_id,edicao_id')]); setIts(q.data ?? []); if (r.error) setErro(r.error.message); else { setRows(r.data); setErro('') } } catch { setErro('Sem conexão.') } }
  useEffect(() => { carregar() }, [])
  const lista = rows.filter(v => (!fl.de || v.data >= fl.de) && (!fl.ate || v.data <= fl.ate) && (!fl.canal || v.canal === fl.canal) && (!fl.resp || v.responsavel_id === fl.resp) && (!fl.evento || v.evento_id === fl.evento) && (!fl.ed || its.some(i => i.venda_id === v.id && i.edicao_id === fl.ed)))
  const pend = (v: Row) => v.status === 'efetivada' ? v.produtos + v.frete - v.recebido : 0
  const set = (k: string) => (e: React.ChangeEvent<any>) => setFl({ ...fl, [k]: e.target.value })
  const ok = () => { carregar(); onOk() }
  async function expRec() {
    try { const r = await supabase!.from('recebimentos').select('*').order('data'); if (r.error) return setErro(r.error.message)
      baixar('recebimentos.csv', ['Data', 'Venda', 'Valor (R$)', 'Forma', 'Quem recebeu', 'Situação'], r.data.map(x => [x.data, x.venda_id, x.valor_centavos / 100, x.meio, x.destino === 'coletivo' ? 'Coletivo' : nm(d, 'pessoas', x.pessoa_id), x.estornado ? 'Estornado' : 'Valendo']))
    } catch { setErro('Sem conexão.') }
  }
  return <><h2>Vendas</h2>
    <details open><summary>Filtros</summary><div className="filtros">
      <label>De<input type="date" value={fl.de} onChange={set('de')} /></label><label>Até<input type="date" value={fl.ate} onChange={set('ate')} /></label>
      <label>Canal<select value={fl.canal} onChange={set('canal')}><option value="">Todos</option>{['direta', 'feira', 'evento', 'site', 'outro'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Responsável<select value={fl.resp} onChange={set('resp')}><option value="">Todos</option>{d.pessoas?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
      <label>Edição<select value={fl.ed} onChange={set('ed')}><option value="">Todas</option>{d.edicoes?.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}</select></label><label>Evento<select value={fl.evento} onChange={set('evento')}><option value="">Todos</option>{d.eventos?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label></div></details>
    <button onClick={() => baixar('vendas.csv', ['Data', 'Situação', 'Canal', 'Responsável', 'Evento', 'Exemplares', 'Produtos (R$)', 'Frete cobrado (R$)', 'Recebido (R$)', 'Pendente (R$)', 'Observações'],
      lista.map(v => [v.data, v.status, v.canal, nm(d, 'pessoas', v.responsavel_id), v.evento_id ? nm(d, 'eventos', v.evento_id) : '', v.qtd, v.produtos / 100, v.frete / 100, v.recebido / 100, pend(v) / 100, v.obs ?? '']))}>Exportar CSV</button>
    <button onClick={expRec}>Exportar recebimentos (CSV)</button>{erro && <div className="erro" role="alert">{erro}</div>}{!lista.length && !erro && <p>Nenhuma venda encontrada.</p>}
    <table><thead><tr><th>Data</th><th>Quem</th><th>Qtd</th><th>Produtos</th><th>Pendente</th><th>Situação</th><th></th></tr></thead><tbody>
      {lista.map(v => <><tr key={v.id}><td>{v.data}</td><td>{nm(d, 'pessoas', v.responsavel_id)}</td><td>{v.qtd}</td><td>{brl(v.produtos)}</td><td>{brl(pend(v))}</td><td>{v.status === 'desfeita' ? 'Desfeita' : pend(v) > 0 ? 'Pendente' : 'Paga'}</td>
        <td><button onClick={() => setAb(ab === v.id ? null : v.id)}>{ab === v.id ? 'Fechar' : 'Detalhes'}</button></td></tr>
        {ab === v.id && <tr key={v.id + 'd'}><td colSpan={7}><Detalhe v={v} d={d} onOk={ok} pend={pend(v)} /></td></tr>}</>)}</tbody></table></>
}

function Detalhe({ v, d, onOk, pend }: { v: Row; d: Dados; onOk: () => void; pend: number }) {
  const [it, setIt] = useState<Row[]>([]); const [rc, setRc] = useState<Row[]>([]); const [erro, setErro] = useState('')
  const [f, setF] = useState({ valor: '', meio: 'pix', dest: 'coletivo' }); const [devE, setDevE] = useState(true); const [devD, setDevD] = useState(false)
  const rec = useEnvio(() => { carregar(); onOk() })
  async function carregar() { try { const [a, b] = await Promise.all([supabase!.from('venda_itens').select('*').eq('venda_id', v.id), supabase!.from('recebimentos').select('*').eq('venda_id', v.id).order('data')]); setIt(a.data ?? []); setRc(b.data ?? []) } catch { setErro('Sem conexão.') } }
  useEffect(() => { carregar() }, [])
  async function desfazer() {
    if (!confirm('Desfazer esta venda? Os recebimentos serão estornados.')) return
    try { const r = await supabase!.rpc('desfazer_venda', { p: { venda_id: v.id, devolver_estoque: devE, dinheiro_devolvido: devD } }); if (r.error) setErro(r.error.message); else onOk() } catch { setErro('Sem conexão.') }
  }
  async function estornar(id: string) {
    if (!confirm('Você já devolveu esse dinheiro ao comprador? O valor sai dos totais e a venda volta a ter pendência.')) return
    try { const r = await supabase!.rpc('estornar_recebimento', { p: { recebimento_id: id, dinheiro_devolvido: true } }); if (r.error) setErro(r.error.message); else { carregar(); onOk() } } catch { setErro('Sem conexão.') }
  }
  return <div><ul>{it.map(i => <li key={i.id}>{i.qtd}× {nm(d, 'edicoes', i.edicao_id)} a {brl(i.preco_centavos)}{i.desconto_centavos > 0 && ` (desconto ${brl(i.desconto_centavos)})`} — de {nm(d, 'locais', i.origem_id)}</li>)}</ul>
    <p>Frete cobrado: {brl(v.frete)} · Custo do frete: {v.frete_custo_centavos == null ? 'não informado' : brl(v.frete_custo_centavos)}</p>
    <h4>Recebimentos</h4>{rc.length ? <ul>{rc.map(r => <li key={r.id}>{r.data}: {brl(r.valor_centavos)} ({r.meio}) → {r.destino === 'coletivo' ? 'coletivo' : nm(d, 'pessoas', r.pessoa_id)} {r.estornado ? '[estornado]' : v.status === 'efetivada' && <button onClick={() => estornar(r.id)}>Estornar</button>}</li>)}</ul> : <p>Nenhum.</p>}
    {erro && <div className="erro" role="alert">{erro}</div>}
    {v.status === 'efetivada' && <>
      {pend > 0 && <form onSubmit={e => { e.preventDefault(); rec.enviar('registrar_recebimento', { venda_id: v.id, valor_centavos: cents(f.valor), meio: f.meio, destino: f.dest === 'coletivo' ? 'coletivo' : 'pessoa', pessoa_id: f.dest === 'coletivo' ? null : f.dest }).then(o => o && setF({ ...f, valor: '' })) }}>
        <h4>Registrar recebimento (pendente {brl(pend)})</h4>
        <label>Valor (R$)<input inputMode="decimal" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} required /></label>
        <label>Forma<select value={f.meio} onChange={e => setF({ ...f, meio: e.target.value })}>{['pix', 'dinheiro', 'cartao', 'transferencia', 'outro'].map(m => <option key={m}>{m}</option>)}</select></label>
        <label>Quem recebeu<select value={f.dest} onChange={e => setF({ ...f, dest: e.target.value })}><option value="coletivo">Coletivo</option>{d.pessoas?.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        <Aviso erro={rec.erro} incerto={rec.incerto} descartar={rec.descartar} /><button disabled={rec.env}>{rec.env ? 'Salvando…' : 'Salvar recebimento'}</button></form>}
      <h4>Desfazer venda</h4>
      <label><input type="checkbox" checked={devE} onChange={e => setDevE(e.target.checked)} /> Os exemplares voltaram ao estoque</label>
      {v.recebido > 0 && <label><input type="checkbox" checked={devD} onChange={e => setDevD(e.target.checked)} /> Já devolvi o dinheiro ao comprador</label>}
      {v.recebido > 0 && !devD && <p className="nota">Venda paga: só dá para desfazer depois de devolver o dinheiro. Repasses já feitos não são desfeitos sozinhos.</p>}
      <button onClick={desfazer} disabled={v.recebido > 0 && !devD}>Desfazer venda</button></>}</div>
}

export function Repasses({ d, onOk }: { d: Dados; onOk: () => void }) {
  const [rows, setRows] = useState<Row[]>([]); const [erro, setErro] = useState('')
  async function carregar() { try { const r = await supabase!.from('repasses').select('*').order('data', { ascending: false }); if (r.error) setErro(r.error.message); else setRows(r.data) } catch { setErro('Sem conexão.') } }
  useEffect(() => { carregar() }, [d.fin])
  async function desfazer(id: string) {
    if (!confirm('Desfazer este repasse?')) return
    try { const r = await supabase!.rpc('desfazer_repasse', { p_id: id }); if (r.error) setErro(r.error.message); else { carregar(); onOk() } } catch { setErro('Sem conexão.') }
  }
  return <><h3>Repasses registrados</h3>{erro && <div className="erro" role="alert">{erro}</div>}{!rows.length && <p>Nenhum repasse ainda.</p>}
    <button onClick={() => baixar('repasses.csv', ['Data', 'Pessoa', 'Valor (R$)', 'Situação', 'Observação'], rows.map(r => [r.data, nm(d, 'pessoas', r.pessoa_id), r.valor_centavos / 100, r.desfeito ? 'Desfeito' : 'Valendo', r.obs ?? '']))}>Exportar CSV</button>
    <table><thead><tr><th>Data</th><th>Pessoa</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id}><td>{r.data}</td><td>{nm(d, 'pessoas', r.pessoa_id)}</td><td>{brl(r.valor_centavos)}</td><td>{r.desfeito ? 'Desfeito' : 'Valendo'}</td><td>{!r.desfeito && <button onClick={() => desfazer(r.id)}>Desfazer</button>}</td></tr>)}</tbody></table></>
}
