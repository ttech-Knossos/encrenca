# Encrenca — gestão interna (MVP, conta compartilhada)

## STATUS REAL
Validado externamente: `npm install` e `npm run build` (compilação TypeScript) passaram na versão anterior. **Não validado:** nenhum SQL foi executado e nenhum fluxo conectado ao Supabase foi testado; as alterações desta versão (migração 004 e telas novas) também ainda não foram compiladas. Rode a "Validação" num projeto de teste antes de usar.

## Arquivos SQL — ordem obrigatória
1. `supabase/migrations/001_schema.sql` (tabelas, RLS, funções básicas)
2. `supabase/migrations/002_correcoes_e_fluxos.sql` (venda reforçada, recebimentos, desfazer venda)
3. `supabase/migrations/003_consistencia_views.sql` (estoque/repasse reforçados, views de vendas e painel)
4. `supabase/migrations/004_devolucao_e_estorno.sql` (venda paga só desfaz com devolução confirmada; estorno de recebimento; hash em recebimento)
5. `supabase/seed_inicial.sql` (as 5 pessoas e locais; rodar só uma vez)

### Instalação do zero
1. supabase.com → New project. Authentication → Providers → Email: desligue "Allow new users to sign up".
2. SQL Editor: rode 001, 002, 003, 004 e o seed, nessa ordem.
3. Authentication → Users → Add user: e-mail e senha do coletivo (nunca no código). Copie o UID.
4. SQL Editor: `insert into acesso_autorizado(uid) values('UID-COPIADO');`
5. Settings → API: copie a URL e a chave pública (anon/publishable). Nunca use service_role.
6. Local: `cp .env.example .env` e preencha. `npm install && npm run dev`.
7. Authentication → URL Configuration: coloque o endereço do site (local e, depois, o da Cloudflare).

### Atualizar uma instalação anterior (sem apagar dados)
Rode no SQL Editor, na ordem, apenas os arquivos que ainda não rodou: 002 e depois 003 (ambos usam `create or replace`/`if not exists` e preservam os dados). Não rode 001 nem o seed de novo. Depois publique o novo código.

## Cloudflare Pages
- Via GitHub: build `npm run build`, saída `dist`, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. `public/_redirects` cobre rotas SPA.
- Upload direto: envie a pasta `dist/` já gerada (não o ZIP do código).
- Depois: atualize Site URL/Redirect URLs no Supabase.

## Uso do dia a dia (tudo pelo app)
Cadastros (edições, pessoas, eventos) → Estoque (estoque inicial/entrada/distribuir/transferir/devolver/cortesia/perda) → Registrar venda (vários itens, desconto, data, evento, frete em "Mais detalhes") → Vendas (detalhes, receber depois, desfazer) → Repasses (registrar e desfazer) → Visão geral (painel). CSV: botões nas telas Vendas e Repasses.
Primeiros passos reais: defina a data de corte, conte os exemplares, lance "Estoque inicial" por pessoa (sem repetir no central), faça uma venda e um repasse de teste e desfaça-os.

## Backup e restauração
- CSV é relatório, **não** é backup.
- Backup: `pg_dump "postgresql://postgres:SENHA@db.REF.supabase.co:5432/postgres" -Fc -f encrenca.dump` (string em Settings → Database; guarde o arquivo em local seguro do coletivo). Verifique no painel do Supabase se seu plano inclui backups automáticos; não presuma.
- Restaurar em projeto de teste: crie outro projeto e rode `pg_restore --no-owner -d "STRING_DO_TESTE" encrenca.dump`. Reconfira `acesso_autorizado` (o UID muda se a conta for recriada).
- Recuperar acesso/trocar senha: Authentication → Users no painel. Recuperação por e-mail exige SMTP configurado.

## Validação (a fazer)
    npm install && npm run build         # compila TypeScript e gera dist/
    # SQL (projeto de TESTE): rode supabase/tests/001_cenarios.sql — "TESTES OK (rollback intencional)" = passou. Cobre execução sequencial.
    # Concorrência real (duas conexões): DATABASE_URL=... sh supabase/tests/concorrencia.sh  — esperado: duas linhas "OK" e saldo 0
Limitações: vendas/estoque anteriores ao início do uso não entram nos totais; frete é informativo (custo não abate repasse); "site" é só classificação.

## Requisitos × implementação × validação
Legenda: **NT** implementado, não testado · **T** testado · **—** não implementado. Nada foi testado além do build do front-end anterior, então não há itens T.

| Requisito | Onde | Estado |
|---|---|---|
| Cadastrar e editar edições, pessoas, eventos; desativar/arquivar sem perder histórico | Cadastros (`Extras.tsx`); renomear pessoa/evento atualiza o local | NT |
| Estoque: inicial, entrada, distribuir, transferir, devolver, cortesia, perda; saldo por pessoa | Estoque; `mover_estoque`; Visão geral | NT |
| Venda com vários itens, desconto, data, origem, canal, evento, frete | `VendaForm.tsx`; `registrar_venda` | NT |
| Recebimento na venda e posteriores; pendências | Vendas → Detalhes; `registrar_recebimento` (compara conteúdo do op_id) | NT |
| Estorno de recebimento isolado | Detalhes → Estornar; `estornar_recebimento` (exige devolução confirmada; não desfaz repasse) | NT |
| Desfazer venda: dinheiro, estoque, histórico | `desfazer_venda`: venda paga só com devolução confirmada; repasse real preservado e bloqueia se o valor já foi repassado | NT |
| Corrigir venda | Desfazer e refazer (aceito no MVP); `historico` guarda as ações | NT |
| Repasses: registrar, listar, desfazer | Repasses; `registrar_repasse`, `desfazer_repasse` | NT |
| Painel sem dupla contagem | `v_painel`, Visão geral | NT |
| Listagens e filtros (período, edição, responsável, canal, evento) | Vendas | NT |
| CSV: vendas, recebimentos, repasses, estoque | botões nas telas; `csv.ts` com proteção contra fórmulas | NT |
| op_id idempotente com lock e hash (venda, recebimento, estoque, repasse) | SQL 002–004 | NT |
| Falha de rede: dados preservados, tentativa incerta bloqueia mudança de conteúdo | `envio.tsx` (trata `status 0`/erro sem código como incerto) | NT |
| Teste sequencial dos cenários 1, 2, 7 (reenvio), 8, 10, saldo insuficiente, estorno, recebimento com op_id divergente | `tests/001_cenarios.sql` | escrito, não executado |
| Teste de concorrência real (mesmo op_id; último exemplar) | `tests/concorrencia.sh` | escrito, não executado |
| Cenários 3, 4, 5, 6, 9, 11, 12; testes de CSV e de interface | — | — |
| RLS e acesso só do UID autorizado | 001 | NT |
| Rotas por URL, dados de demonstração, logo oficial | — (logo: texto "Encrenca", trocar `.logo` em `App.tsx`) | — | 
