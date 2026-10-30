-- =================================================================
--  ZUSTAND-VERLAUF DER AUFTRÄGE
--  Jeder Wechsel des Zustands eines Auftrags (geplant, Rüsten,
--  QS Check, läuft, fertig) kommt als Zeile in auftrag_zustand_verlauf,
--  mit Maschine, Wer und Wann. Die Statistik zeigt daraus beim
--  Auftragswechsel die Zeitachse letzte Stückzahl → Ende → Rüsten →
--  QS Check → Läuft → erste Stückzahl (Wunsch Patrick 30. Oktober 2026).
--  Bisher kannte die Datenbank nur started_at und ended_at; Rüsten und
--  QS Check gibt es darum erst ab jetzt. Läuft und Fertig von früher
--  werden einmal aus started_at / ended_at nachgetragen.
--  Lesen alle ausser Externen und Dienst; schreiben tut nur der Auslöser.
--  Mehrfach ausführbar.
-- =================================================================

create table if not exists public.auftrag_zustand_verlauf (
  id         bigint generated always as identity primary key,
  job_id     uuid not null,
  machine_id uuid,
  von        text,
  nach       text not null,
  wer        uuid references public.profiles (id) on delete set null,
  am         timestamptz not null default now(),
  nachgetragen boolean not null default false
);
create index if not exists auftrag_zustand_verlauf_job on public.auftrag_zustand_verlauf (job_id, am);
create index if not exists auftrag_zustand_verlauf_maschine on public.auftrag_zustand_verlauf (machine_id, am);

alter table public.auftrag_zustand_verlauf enable row level security;
drop policy if exists "zustand_verlauf lesen" on public.auftrag_zustand_verlauf;
create policy "zustand_verlauf lesen" on public.auftrag_zustand_verlauf for select to authenticated
  using (darf_lesen() and not ist_extern() and not bin_dienst());

create or replace function public.auftrag_zustand_merken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.plan_status is not null and new.plan_status <> 'geplant' then
      insert into auftrag_zustand_verlauf (job_id, machine_id, von, nach, wer)
        values (new.id, new.machine_id, null, new.plan_status, auth.uid());
    end if;
  elsif new.plan_status is distinct from old.plan_status and new.plan_status is not null then
    insert into auftrag_zustand_verlauf (job_id, machine_id, von, nach, wer)
      values (new.id, new.machine_id, old.plan_status, new.plan_status, auth.uid());
  end if;
  return new;
end $$;

create or replace trigger jobs_zustand_verlauf
  after insert or update of plan_status on public.jobs
  for each row execute function public.auftrag_zustand_merken();

-- Einmal nachtragen: Läuft und Fertig aus den Zeitstempeln (ab 1.9.2026)
insert into public.auftrag_zustand_verlauf (job_id, machine_id, von, nach, am, nachgetragen)
  select j.id, j.machine_id, null, 'laeuft', j.started_at, true
  from public.jobs j
  where j.started_at >= '2026-09-01'
    and not exists (select 1 from public.auftrag_zustand_verlauf v where v.job_id = j.id and v.nach = 'laeuft');
insert into public.auftrag_zustand_verlauf (job_id, machine_id, von, nach, am, nachgetragen)
  select j.id, j.machine_id, null, 'fertig', j.ended_at, true
  from public.jobs j
  where j.ended_at >= '2026-09-01'
    and not exists (select 1 from public.auftrag_zustand_verlauf v where v.job_id = j.id and v.nach = 'fertig');

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from pg_trigger where tgname = 'jobs_zustand_verlauf')
  and exists (select 1 from information_schema.tables where table_name = 'auftrag_zustand_verlauf')
  then 'ok' else 'FEHLT' end as probe;
