-- =================================================================
--  MELDUNGEN BEIM ANMELDEN (1.44.0)
--
--  Was das tut, in einfachen Worten:
--  Admins schreiben unter Einstellungen → Allgemein → „Meldungen beim
--  Anmelden“ eine Meldung, zum Beispiel was neu in der App ist. Wer
--  sich danach anmeldet, sieht sie zuerst und muss auf „Gelesen“
--  tippen, bevor es weitergeht. Jede Meldung kommt pro Person nur
--  einmal.
--
--  Diese Datei legt zwei Tabellen an:
--    anmelde_meldungen    die Meldungen (Titel, Text, ein oder aus)
--    anmelde_quittungen   wer welche Meldung wann gelesen hat
--
--  Lesen dürfen alle Angemeldeten ausser Externen, schreiben nur
--  Admins. Quittieren darf jeder nur für sich selbst; die Quittungen
--  aller sehen nur Admins (für „wer hat gelesen“).
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.anmelde_meldungen (
  id        uuid primary key default gen_random_uuid(),
  titel     text not null,
  text      text not null default '',
  aktiv     boolean not null default true,
  erstellt  timestamptz not null default now(),
  geaendert timestamptz,
  von       uuid default auth.uid() references public.profiles (id) on delete set null
);

create table if not exists public.anmelde_quittungen (
  meldung_id uuid not null references public.anmelde_meldungen (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  am         timestamptz not null default now(),
  primary key (meldung_id, user_id)
);

alter table public.anmelde_meldungen enable row level security;
alter table public.anmelde_quittungen enable row level security;

drop policy if exists "anmelde_meldungen lesen" on public.anmelde_meldungen;
create policy "anmelde_meldungen lesen" on public.anmelde_meldungen
  for select to authenticated using (not public.ist_extern());

drop policy if exists "anmelde_meldungen admin" on public.anmelde_meldungen;
create policy "anmelde_meldungen admin" on public.anmelde_meldungen
  for all to authenticated using (public.bin_admin()) with check (public.bin_admin());

drop policy if exists "anmelde_quittungen lesen" on public.anmelde_quittungen;
create policy "anmelde_quittungen lesen" on public.anmelde_quittungen
  for select to authenticated using (user_id = auth.uid() or public.bin_admin());

drop policy if exists "anmelde_quittungen eigene" on public.anmelde_quittungen;
create policy "anmelde_quittungen eigene" on public.anmelde_quittungen
  for insert to authenticated with check (user_id = auth.uid());

-- Admins setzen Quittungen zurück („alle nochmals lesen lassen“)
drop policy if exists "anmelde_quittungen admin weg" on public.anmelde_quittungen;
create policy "anmelde_quittungen admin weg" on public.anmelde_quittungen
  for delete to authenticated using (public.bin_admin());

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle anmelde_meldungen' as punkt,
       case when to_regclass('public.anmelde_meldungen') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Tabelle anmelde_quittungen',
       case when to_regclass('public.anmelde_quittungen') is not null then 'ok' else 'FEHLT' end
union all
select 'Regeln',
       case when (select count(*) from pg_policies where tablename in ('anmelde_meldungen', 'anmelde_quittungen')) = 5
            then 'ok' else 'FEHLT' end;
