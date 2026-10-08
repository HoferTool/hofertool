-- =================================================================
--  MATERIALAUSGABE EXTERN (111.99.0)
--
--  Was das tut, in einfachen Worten:
--  Auf der Startseite steht über den Notizen die Karte
--  „Materialausgabe Extern“. Dort schreibt man auf, was rausgeht,
--  und hakt es ab, wenn es zurück ist.
--
--  Diese Datei legt dafür die Tabelle materialausgabe an:
--    text      was rausging
--    raus_am   wann es rausging (beim Erfassen, von selbst)
--    raus_von  wer es erfasst hat (von selbst)
--    rein_am   wann es abgehakt wurde, leer = noch draussen
--    rein_von  wer es abgehakt hat
--  Abgehakte Einträge bleiben stehen und erscheinen in der Historie.
--
--  Lesen und Schreiben dürfen alle Angemeldeten ausser Externen,
--  wie bei den Notizen.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.materialausgabe (
  id        uuid primary key default gen_random_uuid(),
  text      text not null,
  raus_am   timestamptz not null default now(),
  raus_von  uuid default auth.uid() references public.profiles (id) on delete set null,
  rein_am   timestamptz,
  rein_von  uuid references public.profiles (id) on delete set null
);
create index if not exists materialausgabe_offen on public.materialausgabe (rein_am, raus_am);

alter table public.materialausgabe enable row level security;

drop policy if exists "materialausgabe alle" on public.materialausgabe;
create policy "materialausgabe alle" on public.materialausgabe
  for all to authenticated using (not public.ist_extern()) with check (not public.ist_extern());

-- Damit andere offene Startseiten sofort nachziehen
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'materialausgabe') then
    execute 'alter publication supabase_realtime add table public.materialausgabe';
  end if;
exception when undefined_object then null;   -- ohne Realtime geht es auch
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle materialausgabe' as punkt,
       case when to_regclass('public.materialausgabe') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regel',
       case when exists (select 1 from pg_policies where tablename = 'materialausgabe'
                         and policyname = 'materialausgabe alle') then 'ok' else 'FEHLT' end;
