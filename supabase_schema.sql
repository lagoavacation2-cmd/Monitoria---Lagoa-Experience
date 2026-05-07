-- SQL para criação do banco no Supabase
create extension if not exists pgcrypto;

-- Tabela principal de monitorias
create table if not exists public.monitorias (
 id uuid primary key default gen_random_uuid(),
 departamento text not null default 'Lagoa Experience',
 tipo_atendimento text not null check (tipo_atendimento in ('SDR', 'Closer')),
 colaborador text not null,
 avaliador text,
 data_avaliacao date default current_date,
 mes_referencia text,
 numero_monitoria_mes integer check (numero_monitoria_mes in (1, 2)),
 canal text,
 canais_analisados text,
 quantidade_arquivos integer default 0,
 entra_media_mensal boolean default true,
 nota_ia numeric(5,2) default 0,
 nota_final numeric(5,2) default 0,
 classificacao text,
 classificacao_ia text,
 classificacao_final text,
 resumo_geral text,
 pontos_fortes text,
 pontos_melhoria text,
 falhas_criticas text,
 impacto_falhas text,
 feedback_colaborador text,
 plano_acao text,
 orientacao_treinamento text,
 resumo_analise_cruzada text,
 arquivo_nome text,
 arquivo_url text,
 pdf_nome text,
 pdf_url text,
 status_feedback text default 'Pendente',
 data_feedback date,
 revisada_manualmente boolean default false,
 revisada_por text,
 revisada_em timestamptz,
 observacao_revisao text,
 status_monitoria text default 'Concluída',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

-- Tabela de critérios detalhados
create table if not exists public.monitoria_criterios (
 id uuid primary key default gen_random_uuid(),
 monitoria_id uuid not null references public.monitorias(id) on delete cascade,
 criterio text not null,
 item_avaliado text not null,
 peso numeric(6,2) default 0,
 pontuacao_obtida numeric(6,2) default 0,
 status text,
 comentario text,
 fonte_evidencia text,
 orientacao_correcao text,
 status_ia text,
 pontuacao_ia numeric(6,2),
 comentario_ia text,
 status_final text,
 pontuacao_final numeric(6,2),
 observacao_admin text,
 ajustado_manualmente boolean default false,
 ajustado_por text,
 ajustado_em timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

-- Tabela de arquivos vinculados
create table if not exists public.arquivos_monitoria (
 id uuid primary key default gen_random_uuid(),
 monitoria_id uuid references public.monitorias(id) on delete cascade,
 nome_arquivo text not null,
 tipo_arquivo text,
 canal_arquivo text,
 url_arquivo text,
 storage_path text,
 transcricao_texto text,
 status_transcricao text default 'Não aplicável',
 status_upload text default 'Concluído',
 created_at timestamptz not null default now()
);

-- Tabela de chat com IA
create table if not exists public.chat_monitoria (
 id uuid primary key default gen_random_uuid(),
 monitoria_id uuid not null references public.monitorias(id) on delete cascade,
 autor text not null check (autor in ('Administrador', 'IA')),
 mensagem text not null,
 criterio_relacionado text,
 item_relacionado text,
 created_at timestamptz not null default now()
);

-- View para média mensal
create or replace view public.media_mensal_colaboradores as
select
 colaborador,
 tipo_atendimento,
 mes_referencia,
 max(case when numero_monitoria_mes = 1 and entra_media_mensal = true then nota_final end) as nota_monitoria_1,
 max(case when numero_monitoria_mes = 2 and entra_media_mensal = true then nota_final end) as nota_monitoria_2,
 count(*) filter (where entra_media_mensal = true) as quantidade_monitorias_validas,
 case
 when count(*) filter (where entra_media_mensal = true) >= 2 then
 round(avg(nota_final) filter (where entra_media_mensal = true), 2)
 else null
 end as media_final,
 case
 when count(*) filter (where entra_media_mensal = true) >= 2 then 'Completo'
 else 'Pendente'
 end as status_fechamento
from public.monitorias
group by colaborador, tipo_atendimento, mes_referencia;

-- Buckets de Storage
insert into storage.buckets (id, name, public)
values
 ('monitoria-arquivos', 'monitoria-arquivos', true),
 ('monitoria-pdfs', 'monitoria-pdfs', true)
on conflict (id) do update set public = true;

-- Permissões (RLS Desabilitado conforme solicitado no script SQL)
alter table public.monitorias disable row level security;
alter table public.monitoria_criterios disable row level security;
alter table public.arquivos_monitoria disable row level security;
alter table public.chat_monitoria disable row level security;

-- Grants
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.monitorias to anon, authenticated;
grant select, insert, update, delete on public.monitoria_criterios to anon, authenticated;
grant select, insert, update, delete on public.arquivos_monitoria to anon, authenticated;
grant select, insert, update, delete on public.chat_monitoria to anon, authenticated;
grant select on public.media_mensal_colaboradores to anon, authenticated;

-- Políticas de Storage
drop policy if exists "monitoria storage read" on storage.objects;
drop policy if exists "monitoria storage insert" on storage.objects;
drop policy if exists "monitoria storage update" on storage.objects;
drop policy if exists "monitoria storage delete" on storage.objects;

create policy "monitoria storage read"
on storage.objects
for select
to anon, authenticated
using (bucket_id in ('monitoria-arquivos', 'monitoria-pdfs'));

create policy "monitoria storage insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id in ('monitoria-arquivos', 'monitoria-pdfs'));

create policy "monitoria storage update"
on storage.objects
for update
to anon, authenticated
using (bucket_id in ('monitoria-arquivos', 'monitoria-pdfs'))
with check (bucket_id in ('monitoria-arquivos', 'monitoria-pdfs'));

create policy "monitoria storage delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id in ('monitoria-arquivos', 'monitoria-pdfs'));
