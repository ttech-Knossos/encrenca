-- Incremental sobre 001+002. Endurece op_id em estoque/repasse e cria views de listagem e painel.
alter table movimentos add column if not exists payload_hash text;
alter table repasses add column if not exists payload_hash text;

create or replace function mover_estoque(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare m uuid; ph text; h text:=md5(p::text); oid uuid:=(p->>'op_id')::uuid; o uuid:=nullif(p->>'origem_id','')::uuid; d uuid:=nullif(p->>'destino_id','')::uuid;
 q int:=(p->>'qtd')::int; e uuid:=(p->>'edicao_id')::uuid; tp text:=p->>'tipo'; s int;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 if oid is null then raise exception 'op_id obrigatório'; end if;
 perform pg_advisory_xact_lock(hashtext('op'||oid::text));
 select id,payload_hash into m,ph from movimentos where op_id=oid;
 if found then if ph is distinct from h then raise exception 'op_id já usado com outro conteúdo'; end if; return m; end if;
 if q is null or q<=0 then raise exception 'quantidade inválida'; end if;
 if not ((tp in('entrada','saldo_inicial') and o is null and d is not null)
  or (tp in('distribuicao','transferencia','devolucao') and o is not null and d is not null and o<>d)
  or (tp in('cortesia','perda') and o is not null and d is null)) then raise exception 'tipo/origem/destino incoerentes'; end if;
 if o is not null then
  perform pg_advisory_xact_lock(hashtext(e::text||o::text));
  select coalesce(sum(saldo),0) into s from v_saldos where edicao_id=e and local_id=o;
  if s<q then raise exception 'saldo insuficiente (%)', s; end if; end if;
 insert into movimentos(op_id,payload_hash,tipo,edicao_id,origem_id,destino_id,qtd,em_nome_de,obs)
  values(oid,h,tp,e,o,d,q,nullif(p->>'em_nome_de','')::uuid,p->>'obs') returning id into m;
 insert into historico(acao,em_nome_de,resumo) values('mover_estoque',nullif(p->>'em_nome_de','')::uuid,p);
 return m; end $$;

create or replace function registrar_repasse(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare r uuid; ph text; h text:=md5(p::text); oid uuid:=(p->>'op_id')::uuid; pid uuid:=(p->>'pessoa_id')::uuid; v int:=(p->>'valor_centavos')::int; pend int;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 perform pg_advisory_xact_lock(hashtext('op'||oid::text));
 select id,payload_hash into r,ph from repasses where op_id=oid;
 if found then if ph is distinct from h then raise exception 'op_id já usado com outro conteúdo'; end if; return r; end if;
 perform pg_advisory_xact_lock(hashtext('repasse'||pid::text));
 select recebido-repassado into pend from v_financeiro_pessoa where pessoa_id=pid;
 if v is null or v<=0 or v>pend then raise exception 'valor acima do que a pessoa tem a repassar (%)', pend; end if;
 insert into repasses(op_id,payload_hash,pessoa_id,valor_centavos,data,obs)
  values(oid,h,pid,v,coalesce(nullif(p->>'data','')::date,(now() at time zone 'America/Sao_Paulo')::date),p->>'obs') returning id into r;
 insert into historico(acao,em_nome_de,resumo) values('repasse',nullif(p->>'em_nome_de','')::uuid,p);
 return r; end $$;

create or replace view v_vendas_resumo with(security_invoker=true) as
select v.id,v.data,v.status,v.canal,v.responsavel_id,v.evento_id,v.frete_cobrado_centavos frete,v.frete_custo_centavos,v.obs,
 coalesce(i.produtos,0) produtos, coalesce(i.qtd,0) qtd, coalesce(r.recebido,0) recebido
from vendas v
left join (select venda_id,sum(qtd*preco_centavos-desconto_centavos)::int produtos,sum(qtd)::int qtd from venda_itens group by 1) i on i.venda_id=v.id
left join (select venda_id,sum(valor_centavos)::int recebido from recebimentos where not estornado group by 1) r on r.venda_id=v.id;

-- Painel: estoque e pendências são posição atual; demais são acumulados desde o início do uso.
create or replace view v_painel with(security_invoker=true) as
select (select coalesce(sum(saldo),0) from v_saldos)::int estoque,
 (select coalesce(sum(qtd),0) from v_vendas_resumo where status='efetivada')::int vendidos,
 (select coalesce(sum(produtos),0) from v_vendas_resumo where status='efetivada')::int produtos,
 (select coalesce(sum(frete),0) from v_vendas_resumo where status='efetivada')::int frete,
 (select coalesce(sum(recebido),0) from v_vendas_resumo where status='efetivada')::int recebido_clientes,
 (select coalesce(sum(produtos+frete-recebido),0) from v_vendas_resumo where status='efetivada')::int pendente_clientes,
 (select coalesce(sum(valor_centavos),0) from recebimentos where destino='coletivo' and not estornado)::int recebido_direto,
 (select coalesce(sum(valor_centavos),0) from repasses where not desfeito)::int repassado;
