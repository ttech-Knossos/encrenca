-- Incremental: roda sobre o 001 sem apagar dados.
alter table vendas add column if not exists payload_hash text;
alter table vendas drop constraint if exists vendas_frete_custo_ck;
alter table vendas add constraint vendas_frete_custo_ck check(frete_custo_centavos is null or frete_custo_centavos>=0);
alter table vendas alter column data set default (now() at time zone 'America/Sao_Paulo')::date;
alter table recebimentos alter column data set default (now() at time zone 'America/Sao_Paulo')::date;
alter table repasses alter column data set default (now() at time zone 'America/Sao_Paulo')::date;
alter table edicoes add column if not exists ativa boolean not null default true;

create or replace function registrar_venda(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid; ph text; h text:=md5(p::text); oid uuid:=(p->>'op_id')::uuid; it jsonb; rc jsonb; total int:=0; pago int:=0; s int;
 fr int:=coalesce((p->>'frete_cobrado_centavos')::int,0); fc int:=nullif(p->>'frete_custo_centavos','')::int;
 hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 if oid is null then raise exception 'op_id obrigatório'; end if;
 perform pg_advisory_xact_lock(hashtext('op'||oid::text)); -- tentativas simultâneas do mesmo op_id se serializam
 select id,payload_hash into v,ph from vendas where op_id=oid;
 if found then
  if ph is distinct from h then raise exception 'op_id já usado com outro conteúdo'; end if;
  return v; end if;
 if jsonb_typeof(p->'itens')<>'array' or jsonb_array_length(p->'itens')=0 then raise exception 'venda sem itens'; end if;
 if fr<0 or fc<0 then raise exception 'frete inválido'; end if;
 insert into vendas(op_id,payload_hash,responsavel_id,canal,evento_id,data,frete_cobrado_centavos,frete_custo_centavos,frete_pago_por,obs)
  values(oid,h,(p->>'responsavel_id')::uuid,p->>'canal',nullif(p->>'evento_id','')::uuid,coalesce(nullif(p->>'data','')::date,hoje),
   fr,fc,nullif(p->>'frete_pago_por','')::uuid,p->>'obs') returning id into v;
 for it in select x from jsonb_array_elements(p->'itens') x order by x->>'edicao_id', x->>'origem_id' loop -- ordem fixa de locks
  if (it->>'qtd')::int<=0 or (it->>'preco_centavos')::int<0 or coalesce((it->>'desconto_centavos')::int,0)<0 then raise exception 'item inválido'; end if;
  perform pg_advisory_xact_lock(hashtext((it->>'edicao_id')||(it->>'origem_id')));
  select coalesce(sum(saldo),0) into s from v_saldos where edicao_id=(it->>'edicao_id')::uuid and local_id=(it->>'origem_id')::uuid;
  if s<(it->>'qtd')::int then raise exception 'saldo insuficiente na origem (%)', s; end if;
  insert into venda_itens(venda_id,edicao_id,origem_id,qtd,preco_centavos,desconto_centavos)
   values(v,(it->>'edicao_id')::uuid,(it->>'origem_id')::uuid,(it->>'qtd')::int,(it->>'preco_centavos')::int,coalesce((it->>'desconto_centavos')::int,0));
  insert into movimentos(op_id,tipo,edicao_id,origem_id,qtd,venda_id,em_nome_de)
   values(gen_random_uuid(),'venda',(it->>'edicao_id')::uuid,(it->>'origem_id')::uuid,(it->>'qtd')::int,v,nullif(p->>'em_nome_de','')::uuid);
  total:=total+(it->>'qtd')::int*(it->>'preco_centavos')::int-coalesce((it->>'desconto_centavos')::int,0);
 end loop;
 for rc in select x from jsonb_array_elements(coalesce(p->'recebimentos','[]')) x loop
  pago:=pago+(rc->>'valor_centavos')::int;
  insert into recebimentos(venda_id,data,valor_centavos,meio,destino,pessoa_id)
   values(v,coalesce(nullif(rc->>'data','')::date,hoje),(rc->>'valor_centavos')::int,rc->>'meio',rc->>'destino',nullif(rc->>'pessoa_id','')::uuid);
 end loop;
 if pago>total+fr then raise exception 'recebimento acima do saldo da venda'; end if;
 insert into historico(acao,em_nome_de,resumo) values('venda',nullif(p->>'em_nome_de','')::uuid,p);
 return v; end $$;

create or replace function registrar_recebimento(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare r uuid; oid uuid:=(p->>'op_id')::uuid; vid uuid:=(p->>'venda_id')::uuid; val int:=(p->>'valor_centavos')::int; tot int; pg int; st text;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 perform pg_advisory_xact_lock(hashtext('op'||oid::text));
 select id into r from recebimentos where op_id=oid; if found then return r; end if;
 perform pg_advisory_xact_lock(hashtext('venda'||vid::text));
 select status into st from vendas where id=vid; if st is distinct from 'efetivada' then raise exception 'venda não está ativa'; end if;
 select coalesce(sum(qtd*preco_centavos-desconto_centavos),0)+(select frete_cobrado_centavos from vendas where id=vid) into tot from venda_itens where venda_id=vid;
 select coalesce(sum(valor_centavos),0) into pg from recebimentos where venda_id=vid and not estornado;
 if val is null or val<=0 or pg+val>tot then raise exception 'valor acima do pendente (%)', tot-pg; end if;
 insert into recebimentos(op_id,venda_id,data,valor_centavos,meio,destino,pessoa_id)
  values(oid,vid,coalesce(nullif(p->>'data','')::date,(now() at time zone 'America/Sao_Paulo')::date),val,p->>'meio',p->>'destino',nullif(p->>'pessoa_id','')::uuid) returning id into r;
 insert into historico(acao,em_nome_de,resumo) values('recebimento',nullif(p->>'em_nome_de','')::uuid,p);
 return r; end $$;

-- Desfaz venda: estorna recebimentos, opcionalmente devolve exemplares ao estoque. Idempotente.
create or replace function desfazer_venda(p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare vid uuid:=(p->>'venda_id')::uuid; st text; r record;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 perform pg_advisory_xact_lock(hashtext('venda'||vid::text));
 select status into st from vendas where id=vid for update; if not found then raise exception 'venda inexistente'; end if;
 if st='desfeita' then return; end if;
 for r in select distinct pessoa_id from recebimentos where venda_id=vid and pessoa_id is not null and not estornado order by 1 loop
  perform pg_advisory_xact_lock(hashtext('repasse'||r.pessoa_id::text)); end loop;
 update recebimentos set estornado=true where venda_id=vid and not estornado;
 for r in select f.nome from v_financeiro_pessoa f where f.recebido<f.repassado loop
  raise exception 'Parte desse valor já foi repassada por %. Desfaça antes o repasse correspondente e tente de novo.', r.nome; end loop;
 if coalesce((p->>'devolver_estoque')::boolean,false) then
  insert into movimentos(op_id,tipo,edicao_id,destino_id,qtd,venda_id,em_nome_de,obs)
   select gen_random_uuid(),'estorno',edicao_id,origem_id,qtd,vid,nullif(p->>'em_nome_de','')::uuid,'venda desfeita' from venda_itens where venda_id=vid; end if;
 update vendas set status='desfeita' where id=vid;
 insert into historico(acao,em_nome_de,resumo) values('desfazer_venda',nullif(p->>'em_nome_de','')::uuid,p); end $$;

revoke execute on function registrar_recebimento(jsonb), desfazer_venda(jsonb) from public, anon;
grant execute on function registrar_recebimento(jsonb), desfazer_venda(jsonb) to authenticated;
