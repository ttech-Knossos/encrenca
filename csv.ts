// Células de texto que começam com = + - @ ou tab/CR recebem apóstrofo (proteção contra fórmulas). Separador ; e BOM p/ Excel pt-BR.
export const cel = (v: unknown) => { let s = v == null ? '' : String(v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' }
export const montar = (cab: string[], linhas: unknown[][]) => '\ufeff' + [cab, ...linhas].map(l => l.map(cel).join(';')).join('\r\n')
export function baixar(nome: string, cab: string[], linhas: unknown[][]) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([montar(cab, linhas)], { type: 'text/csv;charset=utf-8' })); a.download = nome; a.click(); URL.revokeObjectURL(a.href)
}
