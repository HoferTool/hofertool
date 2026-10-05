-- =================================================================
--  SKIZZE IM PAD MODE
--
--  Im Pad Mode gibt es rechts eine Zeichenfläche: Man schreibt oder
--  zeichnet mit dem Finger kurze Hinweise zum laufenden Auftrag.
--
--  Was das Skript macht:
--  1. Neue Tabelle pad_skizzen: eine Zeichnung je Auftrag. Gespeichert
--     sind die Striche (Farbe, Dicke, Punkte), kein Bild.
--  2. Lesen und Zeichnen dürfen alle Angemeldeten ausser Externen.
--  3. Wird ein Auftrag auf "Fertig" gesetzt, verschwindet seine
--     Zeichnung von selbst. Wird der Auftrag gelöscht, ebenfalls.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

-- ---------- 1. Die Tabelle ----------
create table if not exists public.pad_skizzen (
  job_id        uuid primary key references public.jobs (id) on delete cascade,
  striche       jsonb not null default '[]'::jsonb,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);


-- ---------- 2. Wer darf was ----------
alter table public.pad_skizzen enable row level security;

drop policy if exists "skizzen alle" on public.pad_skizzen;
create policy "skizzen alle" on public.pad_skizzen
  for all to authenticated using (true) with check (true);

do $$
begin
  if to_regprocedure('public.ist_extern()') is not null then
    execute 'drop policy if exists "extern gesperrt" on public.pad_skizzen';
    execute 'create policy "extern gesperrt" on public.pad_skizzen as restrictive for all '
         || 'to authenticated using (not public.ist_extern()) with check (not public.ist_extern())';
  end if;
end $$;

grant select, insert, update, delete on public.pad_skizzen to authenticated;


-- ---------- 3. Bei "Fertig" weg ----------
create or replace function public.pad_skizze_weg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan_status = 'fertig' and coalesce(old.plan_status, '') <> 'fertig' then
    delete from public.pad_skizzen where job_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists jobs_skizze_weg on public.jobs;
create trigger jobs_skizze_weg after update of plan_status on public.jobs
  for each row execute function public.pad_skizze_weg();

notify pgrst, 'reload schema';


-- ---------- 4. Probe ----------
select 'Tabelle pad_skizzen' as punkt,
       case when to_regclass('public.pad_skizzen') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Zeichnung verschwindet bei Fertig',
       case when exists (select 1 from pg_trigger where tgname = 'jobs_skizze_weg') then 'ok' else 'FEHLT' end;
