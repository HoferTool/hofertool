-- Index aus der WBG (Wunsch Patrick 25. November 2026)
-- Was diese Datei tut:
--  1. Jeder Auftrag bekommt das Feld wbg_index: der Index, den die App aus seiner WBG liest
--     ("Z-Nr.: … Ind. C"). "-" heisst: die WBG sagt "kein Index" (Ind. --), "?" heisst: nicht lesbar.
--  2. Kommt eine neue WBG an den Auftrag, wird der gelesene Index geleert, damit er neu gelesen wird.
--  3. Sobald ein Index gelesen ist, trägt die Datenbank ihn in die Stammdaten der HOCO Nr. ein
--     (hoco_parts.index_nr), und zwar den Index des jüngsten Auftrags dieser HOCO Nr. mit WBG.
-- Gefahrlos mehrfach ausführbar.

alter table public.jobs add column if not exists wbg_index text;

create or replace function public.jobs_wbg_index_leeren() returns trigger
language plpgsql as $$
begin
  if new.wbg_url is distinct from old.wbg_url and new.wbg_index is not distinct from old.wbg_index then
    new.wbg_index := null;
  end if;
  return new;
end $$;

create or replace function public.jobs_wbg_index_stamm() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text;
begin
  if new.job_number is null or new.wbg_index is null or new.wbg_index = '?' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.wbg_index is not distinct from old.wbg_index then
    return null;
  end if;
  select j.wbg_index into v from jobs j
   where j.job_number = new.job_number and j.wbg_index is not null and j.wbg_index <> '?'
   order by j.planned_from desc nulls last, j.created_at desc nulls last
   limit 1;
  if v is null then return null; end if;
  if v = '-' then v := null; end if;
  update hoco_parts set index_nr = v
   where hoco_nr = new.job_number and index_nr is distinct from v;
  return null;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'jobs_wbg_index_leeren') then
    create trigger jobs_wbg_index_leeren before update of wbg_url on public.jobs
      for each row execute function public.jobs_wbg_index_leeren();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'jobs_wbg_index_stamm') then
    create trigger jobs_wbg_index_stamm after insert or update of wbg_index on public.jobs
      for each row execute function public.jobs_wbg_index_stamm();
  end if;
end $$;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns where table_name = 'jobs' and column_name = 'wbg_index')
             and exists (select 1 from pg_trigger where tgname = 'jobs_wbg_index_stamm')
             and exists (select 1 from pg_trigger where tgname = 'jobs_wbg_index_leeren')
        then 'ok' else 'FEHLT' end as probe;
