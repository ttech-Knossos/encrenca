import { useState } from 'react'
import { useEnvio, Aviso } from './envio'

type Row = Record<string, any>
type Dados = Record<string, Row[]>

const cents = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100)
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

const item0 = { ed: '', orig: '', qtd: '1', preco: '', desc: '' }
const vazio = () => ({
  resp: '',
  canal: 'feira',
  data: hoje(),
  evento: '',
  itens: [{ ...item0 }],
  pago: '',
  dest: 'coletivo',
  meio: 'pix',
  fr: '',
  frc: '',
  frp: '',
  obs: ''
})

export function VendaForm({ d, onOk }: { d: Dados; onOk: () => void }) {
  const [f, setF] = useState(vazio())
  const [modoRapido, setModoRapido] = useState(false)
  const [carrinho, setCarrinho] = useState<Record<string, { qtd: number; orig: string; preco: number }>>({})
  const { msg, erro, env, enviar, incerto, descartar } = useEnvio(onOk)

  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value })
  
  const setIt = (i: number, k: string, v: string) =>
    setF({
      ...f,
      itens: f.itens.map((x, j) =>
        j === i
          ? {
              ...x,
              [k]: v,
              ...(k === 'ed'
                ? {
                    preco: ((d.edicoes?.find(e => e.id === v)?.preco_sugerido_centavos ?? 0) / 100)
                      .toFixed(2)
                      .replace('.', ',')
                  }
                : {})
            }
          : x
      )
    })

  const sel = (v: string, on: (v: string) => void, l: Row[] | undefined, k = 'nome', req = true) => (
    <select value={v} onChange={e => on(e.target.value)} required={req}>
      <option value="">Selecione</option>
      {l?.map(x => (
        <option key={x.id} value={x.id}>
          {x[k]}
        </option>
      ))}
    </select>
  )

  // Local Padrão da Central ou do Evento selecionado
  const localPadrao = (edicaoId: string) => {
    if (f.evento) {
      const locEv = d.locais?.find(l => l.evento_id === f.evento)
      if (locEv) return locEv.id
    }
    return d.locais?.find(l => l.tipo === 'central')?.id ?? d.locais?.[0]?.id ?? ''
  }

  // Regra 4: Manipulação da lista rápida (+ / -)
  const alterarQtdCarrinho = (edicaoId: string, delta: number) => {
    const ed = d.edicoes?.find(e => e.id === edicaoId)
    if (!ed) return
    const preco = ed.preco_sugerido_centavos ?? 0
    const orig = localPadrao(edicaoId)

    setCarrinho(prev => {
      const atual = prev[edicaoId]?.qtd ?? 0
      const novaQtd = atual + delta
      if (novaQtd <= 0) {
        const copy = { ...prev }
        delete copy[edicaoId]
        return copy
      }
      return { ...prev, [edicaoId]: { qtd: novaQtd, orig, preco } }
    })
  }

  // Cálculo do total no modo rápido
  const totalModoRapidoCentavos = Object.values(carrinho).reduce((acc, item) => acc + item.preco * item.qtd, 0)

  function submit(e: React.FormEvent) {
    e.preventDefault()

    // Quem é o responsável da venda (Regra 4: se não informado em eventos, usa a 1ª pessoa ativa)
    const respId = f.resp || d.pessoas?.find(p => p.ativa)?.id || ''
    if (!respId) {
      alert('É necessário ter ao menos uma pessoa cadastrada no sistema.')
      return
    }

    let itensEnvio: Array<{ edicao_id: string; origem_id: string; qtd: number; preco_centavos: number; desconto_centavos: number }> = []

    if (modoRapido) {
      itensEnvio = Object.entries(carrinho).map(([edId, item]) => ({
        edicao_id: edId,
        origem_id: item.orig,
        qtd: item.qtd,
        preco_centavos: item.preco,
        desconto_centavos: 0
      }))
    } else {
      itensEnvio = f.itens.map(i => ({
        edicao_id: i.ed,
        origem_id: i.orig,
        qtd: +i.qtd,
        preco_centavos: cents(i.preco),
        desconto_centavos: i.desc ? cents(i.desc) : 0
      }))
    }

    if (itensEnvio.length === 0) {
      alert('Selecione pelo menos um item para registrar a venda.')
      return
    }

    const valorTotalVenda = modoRapido
      ? totalModoRapidoCentavos
      : itensEnvio.reduce((acc, item) => acc + item.qtd * item.preco_centavos - item.desconto_centavos, 0)

    const pago = f.pago ? cents(f.pago) : modoRapido ? valorTotalVenda : 0

    enviar('registrar_venda', {
      responsavel_id: respId,
      em_nome_de: respId,
      canal: f.canal,
      data: f.data,
      evento_id: f.evento || null,
      obs: f.obs,
      itens: itensEnvio,
      frete_cobrado_centavos: f.fr ? cents(f.fr) : 0,
      frete_custo_centavos: f.frc === '' ? '' : cents(f.frc),
      frete_pago_por: f.frp || null,
      recebimentos:
        pago > 0
