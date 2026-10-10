-- Dados reais mínimos: as 5 pessoas e os locais de custódia. Sem vendas nem edições inventadas.
insert into pessoas(nome) values('Ana'),('Tamy'),('Oli'),('Maria'),('Lau');
insert into locais(tipo,nome) values('central','Estoque central');
insert into locais(tipo,nome,pessoa_id) select 'pessoa',nome,id from pessoas;
-- Depois de criar a conta compartilhada em Authentication > Users, rode com o UID dela:
-- insert into acesso_autorizado(uid) values('COLE-O-UID-AQUI');
