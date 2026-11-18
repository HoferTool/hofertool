-- =================================================================
--  ARCHIV FÜR ERLEDIGTE PROBLEME (1.634.0, Wunsch Patrick 18. November 2026:
--  „gibt es ein Archiv für erledigte Probleme?“ – „bitte einbauen, Externe nicht“)
--  Bisher löschte „✓ Erledigt“ den Text des Problems am Auftrag, danach
--  wusste niemand mehr, was es war. Diese Datei
--    1. legt die Tabelle problem_archiv an: je erledigtes Problem eine Zeile
--       mit Text, Auftrag, Maschine, wer es wann gemeldet und wer es wann
--       erledigt hat (Namen als Text dabei, damit sie bleiben)
--    2. ein Auslöser auf jobs schreibt die Zeile von selbst, sobald das
--       Problem eines Auftrags gelöscht (erledigt) oder durch eine neue
--       Meldung ersetzt wird – egal ob von Planwand, Pad, Startseite oder Planer
--  Lesen alle ausser Externen, schreiben nur der Auslöser, löschen (und mit Rückgängig
--  wieder einsetzen) nur Admins. Eingespielt am 18. November 2026.
--  Gefahrlos mehrfach ausführbar, ohne drop. Am Ende eine Probe.
-- =================================================================

create table if not exists public.problem_archiv (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references public.jobs (id) on delete set null,
  machine_id    uuid references public.machines (id) on delete set null,
  job_number    text,
  fa_nr         text,
  problem       text not null,
  gemeldet_am   timestamptz,
  gemeldet_von  uuid references public.profiles (id) on delete set null,
  gemeldet_name text,
  erledigt_am   timestamptz not null default now(),
  erledigt_von  uuid references public.profiles (id) on delete set null,
  erledigt_name text,
  ersetzt       boolean not null default false
);
create index if not exists problem_archiv_zeit on public.problem_archiv (erledigt_am desc);
create index if not exists problem_archiv_job on public.problem_archiv (job_id);

alter table public.problem_archiv enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'problem_archiv' and policyname = 'problem_archiv lesen') then
    create policy "problem_archiv lesen" on public.problem_archiv
      for select to authenticated using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'problem_archiv' and policyname = 'problem_archiv loeschen admin') then
    create policy "problem_archiv loeschen admin" on public.problem_archiv
      for delete to authenticated using ((select public.bin_admin()));
  end if;
  -- Admins dürfen eine gelöschte Zeile mit Rückgängig wieder einsetzen
  if not exists (select 1 from pg_policies where tablename = 'problem_archiv' and policyname = 'problem_archiv zurueck admin') then
    create policy "problem_archiv zurueck admin" on public.problem_archiv
      for insert to authenticated with check ((select public.bin_admin()));
  end if;
end $$;
grant select, insert, delete on public.problem_archiv to authenticated;

create or replace function public.problem_archivieren()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wer uuid := auth.uid();
begin
  if old.problem is not null and btrim(old.problem) <> ''
     and new.problem is distinct from old.problem then
    insert into public.problem_archiv (job_id, machine_id, job_number, fa_nr, problem,
      gemeldet_am, gemeldet_von, gemeldet_name, erledigt_am, erledigt_von, erledigt_name, ersetzt)
    values (old.id, old.machine_id, old.job_number, old.fa_nr, old.problem,
      old.problem_at, old.problem_by,
      (select coalesce(nullif(full_name, ''), email) from public.profiles where id = old.problem_by),
      now(), wer,
      (select coalesce(nullif(full_name, ''), email) from public.profiles where id = wer),
      new.problem is not null and btrim(new.problem) <> '');
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'jobs_problem_archiv') then
    create trigger jobs_problem_archiv after update of problem on public.jobs
      for each row execute function public.problem_archivieren();
  end if;
end $$;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.tables where table_name = 'problem_archiv')
             and exists (select 1 from pg_trigger where tgname = 'jobs_problem_archiv')
            then 'ok' else 'FEHLT' end as probe;
