#!/bin/sh
# Teste de concorrência REAL (duas conexões simultâneas). Use só em projeto de TESTE. Requer psql.  Uso: DATABASE_URL=... sh concorrencia.sh
Q() { psql "$DATABASE_URL" -tA -c "$1"; }
U=00000000-0000-0000-0000-0000000000a1; E=00000000-0000-0000-0000-0000000000a2; P=00000000-0000-0000-0000-0000000000a3; L=00000000-0000-0000-0000-0000000000a4
AUTH="select set_config('request.jwt.claims','{\"sub\":\"$U\"}',false);"
SALE() { echo "$AUTH select registrar_venda('{\"op_id\":\"$1\",\"responsavel_id\":\"$P\",\"canal\":\"feira\",\"itens\":[{\"edicao_id\":\"$E\",\"origem_id\":\"$L\",\"qtd\":1,\"preco_centavos\":3000}]}'::jsonb);"; }
Q "insert into acesso_autorizado values('$U'); insert into edicoes(id,titulo) values('$E','CONC'); insert into pessoas(id,nome) values('$P','CONC'); insert into locais(id,tipo,nome,pessoa_id) values('$L','pessoa','CONC','$P');" >/dev/null
Q "$AUTH select mover_estoque('{\"op_id\":\"00000000-0000-0000-0000-0000000000b0\",\"tipo\":\"entrada\",\"edicao_id\":\"$E\",\"destino_id\":\"$L\",\"qtd\":5}'::jsonb);" >/dev/null
A=00000000-0000-0000-0000-0000000000a5
Q "$(SALE $A)" >/dev/null 2>&1 & Q "$(SALE $A)" >/dev/null 2>&1 & wait
[ "$(Q "select count(*) from vendas where op_id='$A'")" = 1 ] && echo "OK mesmo op_id simultâneo: 1 venda" || echo "FALHOU mesmo op_id"
Q "$AUTH select mover_estoque('{\"op_id\":\"00000000-0000-0000-0000-0000000000b1\",\"tipo\":\"perda\",\"edicao_id\":\"$E\",\"origem_id\":\"$L\",\"qtd\":3}'::jsonb);" >/dev/null  # sobra 1
B=00000000-0000-0000-0000-0000000000a6; C=00000000-0000-0000-0000-0000000000a7
Q "$(SALE $B)" >/dev/null 2>&1 & Q "$(SALE $C)" >/dev/null 2>&1 & wait
[ "$(Q "select count(*) from vendas where op_id in ('$B','$C')")" = 1 ] && echo "OK último exemplar: só 1 venda efetivada" || echo "FALHOU último exemplar"
Q "select saldo from v_saldos where local_id='$L'"  # esperado 0
Q "delete from venda_itens where edicao_id='$E'; delete from movimentos where edicao_id='$E'; delete from vendas where responsavel_id='$P'; delete from locais where id='$L'; delete from pessoas where id='$P'; delete from edicoes where id='$E'; delete from acesso_autorizado where uid='$U';" >/dev/null
