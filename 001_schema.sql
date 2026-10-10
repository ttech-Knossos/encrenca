-- Encrenca MVP: schema, RLS e funções transacionais. Dinheiro em centavos.
create table acesso_autorizado(uid uuid primary key);
alter table acesso_autorizado enable row level security; -- sem policies: só funções definer leem
create function is_autorizado() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from acesso_autorizado where uid=auth.uid()) $$;

create table pessoas(id uuid primary key default gen_random_uuid(), nome text not null, ativa boolean not null default true);
create table edicoes(id uuid primary key default gen_random_uuid(), titulo text not null, numero text, lancamento date,
  preco_sugerido_centavos int not null default 0 check(preco_sugerido_centavos>=0), status text not null default 'ativa', obs text);
create table eventos(id uuid primary key default gen_random_uuid(), nome text not null, data date, local text, ficticio boolean default false);
create table locais(id uuid primary key default gen_random_uuid(), tipo text not null check(tipo in('central','pessoa','evento')),
  nome text not null, pessoa_id uuid references pessoas, evento_id uuid references eventos);

create table vendas(id uuid primary key default gen_random_uuid(), op_id uuid not null unique,
  responsavel_id uuid not null references pessoas, canal text not null check(canal in('direta','feira','evento','site','outro')),
  evento_id uuid references eventos, data date not null default current_date,
  frete_cobrado_centavos int not null default 0 check(frete_cobrado_centavos>=0),
  frete_custo_centavos int, -- NULL = desconhecido; 0 = custo zero
  frete_pago_por uuid references pessoas, obs text, status text not null default 'efetivada', criado_em timestamptz not null default now());
create table venda_itens(id uuid primary key default gen_random_uuid(), venda_id uuid not null references vendas,
  edicao_id uuid not null references edicoes, origem_id uuid not null references locais, qtd int not null check(qtd>0),
  preco_centavos int not null check(preco_centavos>=0), desconto_centavos int not null default 0 check(desconto_centavos>=0),
  check(qtd*preco_centavos-desconto_centavos>=0));
create table movimentos(id uuid primary key default gen_random_uuid(), op_id uuid not null unique,
  tipo text not null check(tipo in('entrada','saldo_inicial','distribuicao','transferencia','devolucao','venda','cortesia','perda','estorno')),
  edicao_id uuid not null references edicoes, origem_id uuid references locais, destino_id uuid references locais,
  qtd int not null check(qtd>0), venda_id uuid references vendas, em_nome_de uuid references pessoas, obs text,
  criado_em timestamptz not null default now(), check(origem_id is not null or destino_id is not null));
create table recebimentos(id uuid primary key default gen_random_uuid(), op_id uuid not null unique default gen_random_uuid(),
  venda_id uuid not null references vendas, data date not null default current_date, valor_centavos int not null check(valor_centavos>0),
  meio text not null check(meio in('pix','dinheiro','cartao','transferencia','outro')),
  destino text not null check(destino in('coletivo','pessoa')), pessoa_id uuid references pessoas, estornado boolean not null default false,
  check((destino='pessoa')=(pessoa_id is not null)));
create table repasses(id uuid primary key default gen_random_uuid(), op_id uuid not null unique,
  pessoa_id uuid not null references pessoas, valor_centavos int not null check(valor_centavos>0), data date not null default current_date,
  obs text, desfeito boolean not null default false, criado_em timestamptz not null default now());
create table historico(id bigserial primary key, quando timestamptz not null default now(), acao text not null, em_nome_de uuid references pessoas, resumo jsonb);

create view v_saldos with(security_invoker=true) as
select edicao_id, local_id, sum(q)::int saldo from (
  select edicao_id, destino_id local_id, qtd q from movimentos where destino_id is not null
  union all select edicao_id, origem_id, -qtd from movimentos where origem_id is not null) t group by 1,2;
create view v_financeiro_pessoa with(security_invoker=true) as
select p.id pessoa_id, p.nome,
  coalesce((select sum(valor_centavos) from recebimentos r where r.pessoa_id=p.id and not r.estornado),0)::int recebido,
  coalesce((select sum(valor_centavos) from repasses x where x.pessoa_id=p.id and not x.desfeito),0)::int repassado from pessoas p;

-- RLS: leitura só para o UID autorizado; escrita em estoque/financeiro somente via RPC.
do $$ declare t text; begin
 foreach t in array array['pessoas','edicoes','eventos','locais','vendas','venda_itens','movimentos','recebimentos','repasses','historico'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy sel on %I for select to authenticated using (is_autorizado())',t);
 end loop;
 foreach t in array array['pessoas','edicoes','eventos','locais'] loop
  execute format('create policy ins on %I for insert to authenticated with check (is_autorizado())',t);
  execute format('create policy upd on %I for update to authenticated using (is_autorizado()) with check (is_autorizado())',t);
 end loop; end $$;

create function mover_estoque(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare m uuid; o uuid:=nullif(p->>'origem_id','')::uuid; d uuid:=nullif(p->>'destino_id','')::uuid;
 q int:=(p->>'qtd')::int; e uuid:=(p->>'edicao_id')::uuid; tp text:=p->>'tipo'; s int;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 select id into m from movimentos where op_id=(p->>'op_id')::uuid; if found then return m; end if;
 if q is null or q<=0 then raise exception 'quantidade inválida'; end if;
 if not ((tp in('entrada','saldo_inicial') and o is null and d is not null)
  or (tp in('distribuicao','transferencia','devolucao') and o is not null and d is not null and o<>d)
  or (tp in('cortesia','perda') and o is not null and d is null)) then raise exception 'tipo/origem/destino incoerentes'; end if;
 if o is not null then
  perform pg_advisory_xact_lock(hashtext(e::text||o::text));
  select coalesce(sum(saldo),0) into s from v_saldos where edicao_id=e and local_id=o;
  if s<q then raise exception 'saldo insuficiente (%)', s; end if; end if;
 insert into movimentos(op_id,tipo,edicao_id,origem_id,destino_id,qtd,em_nome_de,obs)
  values((p->>'op_id')::uuid,tp,e,o,d,q,nullif(p->>'em_nome_de','')::uuid,p->>'obs') returning id into m;
 insert into historico(acao,em_nome_de,resumo) values('mover_estoque',nullif(p->>'em_nome_de','')::uuid,p);
 return m; end $$;

create function registrar_venda(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid; it jsonb; rc jsonb; total int:=0; pago int:=0; s int; fr int:=coalesce((p->>'frete_cobrado_centavos')::int,0);
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 select id into v from vendas where op_id=(p->>'op_id')::uuid; if found then return v; end if;
 insert into vendas(op_id,responsavel_id,canal,evento_id,data,frete_cobrado_centavos,frete_custo_centavos,frete_pago_por,obs)
  values((p->>'op_id')::uuid,(p->>'responsavel_id')::uuid,p->>'canal',nullif(p->>'evento_id','')::uuid,
   coalesce((p->>'data')::date,current_date),fr,nullif(p->>'frete_custo_centavos','')::int,nullif(p->>'frete_pago_por','')::uuid,p->>'obs')
  returning id into v;
 for it in select * from jsonb_array_elements(p->'itens') loop
  perform pg_advisory_xact_lock(hashtext((it->>'edicao_id')||(it->>'origem_id')));
  select coalesce(sum(saldo),0) into s from v_saldos where edicao_id=(it->>'edicao_id')::uuid and local_id=(it->>'origem_id')::uuid;
  if s<(it->>'qtd')::int then raise exception 'saldo insuficiente na origem (%)', s; end if;
  insert into venda_itens(venda_id,edicao_id,origem_id,qtd,preco_centavos,desconto_centavos)
   values(v,(it->>'edicao_id')::uuid,(it->>'origem_id')::uuid,(it->>'qtd')::int,(it->>'preco_centavos')::int,coalesce((it->>'desconto_centavos')::int,0));
  insert into movimentos(op_id,tipo,edicao_id,origem_id,qtd,venda_id,em_nome_de)
   values(gen_random_uuid(),'venda',(it->>'edicao_id')::uuid,(it->>'origem_id')::uuid,(it->>'qtd')::int,v,nullif(p->>'em_nome_de','')::uuid);
  total:=total+(it->>'qtd')::int*(it->>'preco_centavos')::int-coalesce((it->>'desconto_centavos')::int,0);
 end loop;
 for rc in select * from jsonb_array_elements(coalesce(p->'recebimentos','[]')) loop
  pago:=pago+(rc->>'valor_centavos')::int;
  insert into recebimentos(venda_id,data,valor_centavos,meio,destino,pessoa_id)
   values(v,coalesce((rc->>'data')::date,current_date),(rc->>'valor_centavos')::int,rc->>'meio',rc->>'destino',nullif(rc->>'pessoa_id','')::uuid);
 end loop;
 if pago>total+fr then raise exception 'recebimento acima do saldo da venda'; end if;
 insert into historico(acao,em_nome_de,resumo) values('venda',nullif(p->>'em_nome_de','')::uuid,p);
 return v; end $$;

create function registrar_repasse(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare r uuid; pid uuid:=(p->>'pessoa_id')::uuid; v int:=(p->>'valor_centavos')::int; pend int;
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 select id into r from repasses where op_id=(p->>'op_id')::uuid; if found then return r; end if;
 perform pg_advisory_xact_lock(hashtext('repasse'||pid::text));
 select recebido-repassado into pend from v_financeiro_pessoa where pessoa_id=pid;
 if v<=0 or v>pend then raise exception 'valor acima do que a pessoa tem a repassar (%)', pend; end if;
 insert into repasses(op_id,pessoa_id,valor_centavos,data,obs) values((p->>'op_id')::uuid,pid,v,coalesce((p->>'data')::date,current_date),p->>'obs') returning id into r;
 insert into historico(acao,em_nome_de,resumo) values('repasse',nullif(p->>'em_nome_de','')::uuid,p);
 return r; end $$;

create function desfazer_repasse(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_autorizado() then raise exception 'acesso negado'; end if;
 update repasses set desfeito=true where id=p_id and not desfeito;
 if found then insert into historico(acao,resumo) values('desfazer_repasse',jsonb_build_object('id',p_id)); end if; end $$;

revoke execute on function mover_estoque(jsonb), registrar_venda(jsonb), registrar_repasse(jsonb), desfazer_repasse(uuid), is_autorizado() from public, anon;
grant execute on function mover_estoque(jsonb), registrar_venda(jsonb), registrar_repasse(jsonb), desfazer_repasse(uuid), is_autorizado() to authenticated;
