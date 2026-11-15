-- =================================================================
--  LAGER FÜR EIGENE TEILE (seit 1.557.0, Wunsch Patrick 15. November 2026)
--  Provisorisch, nur für Admins: fertige Teile (meist von Aufträgen der
--  Planwand) einbuchen und ausbuchen, bisher im Gewatec.
--  Jede Buchung ist eine Zeile: menge positiv = eingebucht, negativ =
--  ausgebucht. Den Bestand je HOCO Nr. (und Ort) rechnet die App.
--  Lesen und schreiben nur Admins. Gefahrlos mehrfach ausführbar.
-- =================================================================
create table if not exists public.lager_buchungen (
  id uuid primary key default gen_random_uuid(),
  hoco_nr text not null,
  menge integer not null check (menge <> 0),
  ort text,
  job_id uuid references public.jobs(id) on delete set null,
  fa_nr text,
  notiz text,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
create index if not exists lager_buchungen_hoco on public.lager_buchungen (hoco_nr);

alter table public.lager_buchungen enable row level security;
drop policy if exists "lager nur admins" on public.lager_buchungen;
create policy "lager nur admins" on public.lager_buchungen
  for all to authenticated using ((select bin_admin())) with check ((select bin_admin()));

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'lager_buchungen') then 'ok' else 'FEHLT' end as probe;
