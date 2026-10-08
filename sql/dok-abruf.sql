-- =================================================================
--  DOKUMENTE AUF ABRUF: WBG UND ZEICHNUNG BEIM ÖFFNEN NACHSCHAUEN
--
--  Wer in der App eine WBG oder eine Zeichnung öffnet, legt hier eine
--  Anfrage an. Das Programm dokumente-abruf.ps1 auf dem Pool-Rechner
--  schaut alle zwei Sekunden nach, holt die Datei aus dem Ordner,
--  lädt sie hoch und trägt das Ergebnis ein ("neu", "gleich",
--  "keines"). Die App wartet darauf und zeigt die Datei an oder
--  "keine vorhanden" (Wunsch Patrick 8. Oktober 2026, statt Knöpfen
--  und statt alle fünf Minuten).
--
--  Anfragen anlegen und lesen darf jede angemeldete Person, erledigen
--  nur das Dienstkonto (und Admins). Ausserdem darf das Dienstkonto
--  seinen Stand unter app_config.dok_abruf_status melden, damit die
--  App weiss, ob der Rechner gerade lauscht.
--
--  Ohne dieses Skript zeigt die App einfach, was schon da ist.
--  Läuft gefahrlos mehrfach.
-- =================================================================

create table if not exists public.dok_abruf (
  id          bigint generated always as identity primary key,
  art         text not null check (art in ('wbg', 'zeichnung')),
  hoco_nr     text,
  auftrag_id  uuid,
  fa_nr       text,
  von         uuid default auth.uid(),
  angelegt    timestamptz not null default now(),
  angefangen  timestamptz,
  erledigt    timestamptz,
  ergebnis    text,
  adresse     text,
  meldung     text
);

create index if not exists dok_abruf_offen on public.dok_abruf (id) where erledigt is null;

alter table public.dok_abruf enable row level security;

drop policy if exists "lesen" on public.dok_abruf;
create policy "lesen" on public.dok_abruf for select to authenticated
  using ((select public.darf_lesen()));

drop policy if exists "anfragen" on public.dok_abruf;
create policy "anfragen" on public.dok_abruf for insert to authenticated
  with check ((select public.darf_lesen()) and erledigt is null);

drop policy if exists "erledigen" on public.dok_abruf;
create policy "erledigen" on public.dok_abruf for update to authenticated
  using ((select public.bin_dienst()) or (select public.bin_admin()))
  with check ((select public.bin_dienst()) or (select public.bin_admin()));

drop policy if exists "aufraeumen" on public.dok_abruf;
create policy "aufraeumen" on public.dok_abruf for delete to authenticated
  using ((select public.bin_dienst()) or (select public.bin_admin()));

grant select, insert, update, delete on public.dok_abruf to authenticated;

-- Eigene Regel, damit dokumente-pool.sql und einrichtblatt-ordner.sql
-- sie beim nochmaligen Ausführen nicht überschreiben
drop policy if exists "dienst meldet abruf" on public.app_config;
create policy "dienst meldet abruf" on public.app_config for all to authenticated
  using (schluessel = 'dok_abruf_status' and (select public.bin_dienst()))
  with check (schluessel = 'dok_abruf_status' and (select public.bin_dienst()));

notify pgrst, 'reload schema';

-- Probe
select 'Tabelle dok_abruf' as punkt,
       case when to_regclass('public.dok_abruf') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Dienstkonto meldet Abruf',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                           and policyname = 'dienst meldet abruf') then 'ok' else 'FEHLT' end;
