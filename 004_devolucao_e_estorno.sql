-- Incremental sobre 001-003. Não apaga dados.
alter table recebimentos add column if not exists payload_hash text;

create or replace function registrar_recebimento(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare r uuid; ph text; h text:=md5(p::text); oid uuid:=(p->>'op_id')::uuid; vid uuid:=(p->>'venda_id')::uuid; val int:=(p->>'valor_centavos')::int; tot int; pg int; st text;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 if oid is null then raise exception 'op_id obrigatório'; end if;
 perform pg_advisory_xact_lock(hashtext('op'||oid::text));
 select id,payload_hash into r,ph from recebimentos where op_id=oid;
 if found then if ph is distinct from h then raise exception 'op_id já usado com outro conteúdo'; end if; return r; end if;
 perform pg_advisory_xact_lock(hashtext('venda'||vid::text));
 select status into st from vendas where id=vid; if st is distinct from 'efetivada' then raise exception 'venda não está ativa'; end if;
 select coalesce(sum(qtd*preco_centavos-desconto_centavos),0)+(select frete_cobrado_centavos from vendas where id=vid) into tot from venda_itens where venda_id=vid;
 select coalesce(sum(valor_centavos),0) into pg from recebimentos where venda_id=vid and not estornado;
 if val is null or val<=0 or pg+val>tot then raise exception 'valor acima do pendente (%)', tot-pg; end if;
 insert into recebimentos(op_id,payload_hash,venda_id,data,valor_centavos,meio,destino,pessoa_id)
  values(oid,h,vid,coalesce(nullif(p->>'data','')::date,(now() at time zone 'America/Sao_Paulo')::date),val,p->>'meio',p->>'destino',nullif(p->>'pessoa_id','')::uuid) returning id into r;
 insert into historico(acao,em_nome_de,resumo) values('recebimento',nullif(p->>'em_nome_de','')::uuid,p);
 return r; end $$;

-- Venda paga só pode ser desfeita com devolução do dinheiro confirmada. Repasses reais nunca são desfeitos automaticamente.
create or replace function desfazer_venda(p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare vid uuid:=(p->>'venda_id')::uuid; st text; r record; pago int;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 perform pg_advisory_xact_lock(hashtext('venda'||vid::text));
 select status into st from vendas where id=vid for update; if not found then raise exception 'venda inexistente'; end if;
 if st='desfeita' then return; end if;
 select coalesce(sum(valor_centavos),0) into pago from recebimentos where venda_id=vid and not estornado;
 if pago>0 and not coalesce((p->>'dinheiro_devolvido')::boolean,false) then
  raise exception 'Venda paga: só dá para desfazer depois de devolver o dinheiro ao comprador. Confirme a devolução.'; end if;
 for r in select distinct pessoa_id from recebimentos where venda_id=vid and pessoa_id is not null and not estornado order by 1 loop
  perform pg_advisory_xact_lock(hashtext('repasse'||r.pessoa_id::text)); end loop;
 update recebimentos set estornado=true where venda_id=vid and not estornado;
 for r in select f.nome from v_financeiro_pessoa f where f.recebido<f.repassado loop
  raise exception 'Parte desse valor já foi repassada por %. O repasse é mantido; ajuste-o por conta própria antes, se for o caso.', r.nome; end loop;
 if coalesce((p->>'devolver_estoque')::boolean,false) then
  insert into movimentos(op_id,tipo,edicao_id,destino_id,qtd,venda_id,em_nome_de,obs)
   select gen_random_uuid(),'estorno',edicao_id,origem_id,qtd,vid,nullif(p->>'em_nome_de','')::uuid,'venda desfeita' from venda_itens where venda_id=vid; end if;
 update vendas set status='desfeita' where id=vid;
 insert into historico(acao,em_nome_de,resumo) values('desfazer_venda',nullif(p->>'em_nome_de','')::uuid,p); end $$;

create or replace function estornar_recebimento(p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare rid uuid:=(p->>'recebimento_id')::uuid; rr record;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 select * into rr from recebimentos where id=rid; if not found then raise exception 'recebimento inexistente'; end if;
 perform pg_advisory_xact_lock(hashtext('venda'||rr.venda_id::text));
 if rr.pessoa_id is not null then perform pg_advisory_xact_lock(hashtext('repasse'||rr.pessoa_id::text)); end if;
 select * into rr from recebimentos where id=rid;
 if rr.estornado then return; end if;
 if not coalesce((p->>'dinheiro_devolvido')::boolean,false) then raise exception 'Confirme que o dinheiro foi devolvido ao comprador antes de estornar.'; end if;
 update recebimentos set estornado=true where id=rid;
 if rr.pessoa_id is not null and exists(select 1 from v_financeiro_pessoa where pessoa_id=rr.pessoa_id and recebido<repassado) then
  raise exception 'Esse valor já foi repassado. O repasse é mantido; ajuste-o antes, se for o caso.'; end if;
 insert into historico(acao,em_nome_de,resumo) values('estornar_recebimento',nullif(p->>'em_nome_de','')::uuid,p); end $$;

revoke execute on function estornar_recebimento(jsonb) from public, anon;
grant execute on function estornar_recebimento(jsonb) to authenticated;
