-- =================================================================
--  VERLAUF DER DOKUMENTE
--
--  Jede Datei, die abgelegt, ersetzt oder aufgeräumt wird, bekommt
--  einen Eintrag: wann, welche Datei, wohin, wie (von Hand, aus einem
--  Ordner, vom Netzlaufwerk) und von wem. Zu sehen in den
--  Einstellungen unter Dokumente → Verlauf.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

create table if not exists public.dokumente_verlauf (
  id        uuid primary key default gen_random_uuid(),
  zeit      timestamptz not null default now(),
  dateiname text,
  art       text,
  hoco_nr   text,
  type_id   uuid,
  ziel      text,
  quelle    text,
  ersetzt   boolean not null default false,
  von       uuid default auth.uid()
);

create index if not exists idx_dokumente_verlauf_zeit on public.dokumente_verlauf (zeit desc);

alter table public.dokumente_verlauf enable row level security;

drop policy if exists "verlauf lesen und schreiben" on public.dokumente_verlauf;
create policy "verlauf lesen und schreiben" on public.dokumente_verlauf
  for all to authenticated using (true) with check (true);

-- Externe sehen den Verlauf nicht
drop policy if exists "extern gesperrt" on public.dokumente_verlauf;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'ist_extern') then
    execute 'create policy "extern gesperrt" on public.dokumente_verlauf as restrictive for all '
         || 'to authenticated using (not (select public.ist_extern())) '
         || 'with check (not (select public.ist_extern()))';
  end if;
end $$;

notify pgrst, 'reload schema';

select 'Tabelle dokumente_verlauf' as punkt,
       case when to_regclass('public.dokumente_verlauf') is not null then 'ok' else 'FEHLT' end as ergebnis;
