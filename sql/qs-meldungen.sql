-- =================================================================
--  QS-MELDUNGEN (1.77.0, Wunsch Patrick 16. Oktober 2026)
--
--  Was das tut, in einfachen Worten:
--  Auf der neuen Seite „QS“ meldet man zu einem laufenden Auftrag,
--  dass Ausschussteile aussortiert wurden: wie viele Stück man am
--  Counter abziehen soll und eine Notiz. Die App rechnet nichts davon
--  selbst ab. Im Pad Mode der Maschine steht die Meldung anstelle des
--  Wetters, bis jemand quittiert. Quittieren löscht die Meldung.
--
--  Diese Datei
--    1. legt die Tabelle qs_meldungen an
--         job_id       der Auftrag
--         machine_id   die Maschine (dort erscheint die Meldung im Pad)
--         hoco_nr      HOCO Nr. des Auftrags, wie sie beim Melden war
--         stueck       Stück, die man am Counter abziehen soll
--         notiz        freier Text
--         erstellt_am / erstellt_von / erstellt_name   von selbst
--    2. erlaubt Lesen, Melden und Quittieren allen Angemeldeten
--       ausser Externen
--    3. nimmt den Zustand „QS Check“ bei Aufträgen weg: wer noch
--       darauf steht, kommt auf „Rüsten“ (der Schritt davor)
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.qs_meldungen (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.jobs (id) on delete set null,
  machine_id   uuid references public.machines (id) on delete cascade,
  hoco_nr      text,
  stueck       integer not null check (stueck > 0),
  notiz        text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid() references public.profiles (id) on delete set null
);
alter table public.qs_meldungen add column if not exists erstellt_name text;

create index if not exists qs_meldungen_maschine on public.qs_meldungen (machine_id, erstellt_am);

alter table public.qs_meldungen enable row level security;

drop policy if exists "qs_meldungen alle" on public.qs_meldungen;
create policy "qs_meldungen alle" on public.qs_meldungen
  for all to authenticated using (not public.ist_extern()) with check (not public.ist_extern());

-- Damit das Pad an der Maschine die Meldung sofort zeigt
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'qs_meldungen') then
    execute 'alter publication supabase_realtime add table public.qs_meldungen';
  end if;
exception when undefined_object then null;
end $$;

-- Zustand „QS Check“ gibt es nicht mehr
update public.jobs set plan_status = 'ruesten' where plan_status = 'qs';
-- Eine zusätzliche Sperre statt die alte Regel zu ersetzen: so kommt
-- niemand mehr auf „qs“, auch nicht aus einer alten Fassung der App
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_plan_status_ohne_qs') then
    alter table public.jobs add constraint jobs_plan_status_ohne_qs check (plan_status is distinct from 'qs');
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle qs_meldungen' as punkt,
       case when to_regclass('public.qs_meldungen') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regel',
       case when exists (select 1 from pg_policies where tablename = 'qs_meldungen'
                         and policyname = 'qs_meldungen alle') then 'ok' else 'FEHLT' end
union all
select 'Kein Auftrag mehr auf QS Check',
       case when not exists (select 1 from public.jobs where plan_status = 'qs') then 'ok' else 'FEHLT' end;
