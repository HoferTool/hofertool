-- =================================================================
--  EINRICHTBLATT IN DER APP (1.43.0, Test)
--
--  Was das tut, in einfachen Worten:
--  Bisher war das Einrichtblatt eine Excel-Datei je HOCO Nr. und
--  Maschinentyp. Neu steht der Inhalt in der App, und das Blatt wird
--  beim Öffnen daraus gezeichnet (Wunsch Patrick, 12. und 13. Oktober
--  2026). Diese Datei legt dafür an:
--
--  Tabelle einrichtblatt_app, eine Zeile je HOCO Nr. und Typ:
--    programme    Programm-Nummer je Path, z. B. {"1": "Ø1329"}
--    geometrie    Geometriedaten (bisher nur SW-20)
--    maschine_nr  „Nr.122“ hinter Autom.-Typ
--    bemerkung    freie Zeilen unten im Kopf, z. B. „Abgreifen mit …“
--    plaetze      je Werkzeugplatz (T100, T200 …): Tätigkeit, Mass,
--                 Hersteller, Werkzeug, Artikel, HD, Standzeit, Bild
--    kopf         was nur auf diesem Blatt steht: FA Nr., N1000 (Star),
--                 Festanschlag und Anschlag (Index); seit 1.164.0
--    excel_url    das Excel, aus dem das Blatt eingelesen wurde
--    gut_am       wann jemand „Blatt ist gut“ gedrückt hat; danach ist
--                 das Excel weg und die Aufgabe „HoferTool“ lädt für
--                 diese Nummer und diesen Typ kein Excel mehr hoch
--
--  Spalte machine_types.blatt_aufbau: wo welcher Platz auf dem Blatt
--  steht. Beim SW-20 genau wie im bisherigen Excel; ohne Eintrag ordnet
--  die App die Plätze selbst nach Path.
--
--  Artikel-Bezeichnung, Zeichnungs-Nr., Index und Waschgebinde stehen
--  weiter in den Stammdaten der HOCO Nr. (hoco_parts), Stückzeit und
--  Stück am Abend je Typ in hoco_type_data, also nicht doppelt.
--
--  Lesen dürfen alle Angemeldeten, ändern alle ausser Externen.
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.einrichtblatt_app (
  id            uuid primary key default gen_random_uuid(),
  hoco_nr       text not null,
  type_id       uuid not null references public.machine_types (id) on delete cascade,
  programme     jsonb not null default '{}'::jsonb,
  geometrie     text,
  maschine_nr   text,
  bemerkung     text,
  plaetze       jsonb not null default '{}'::jsonb,
  excel_url     text,
  gut_am        timestamptz,
  gut_von       uuid references public.profiles (id) on delete set null,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (hoco_nr, type_id)
);

alter table public.machine_types add column if not exists blatt_aufbau jsonb;
alter table public.einrichtblatt_app add column if not exists kopf jsonb not null default '{}'::jsonb;

-- Wer zuletzt geändert hat, kommt von selbst
create or replace function public.einrichtblatt_app_geaendert()
returns trigger language plpgsql set search_path = public as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := coalesce(auth.uid(), new.geaendert_von);
  return new;
end $$;
drop trigger if exists einrichtblatt_app_geaendert on public.einrichtblatt_app;
create trigger einrichtblatt_app_geaendert before update on public.einrichtblatt_app
  for each row execute function public.einrichtblatt_app_geaendert();

alter table public.einrichtblatt_app enable row level security;
drop policy if exists "lesen" on public.einrichtblatt_app;
create policy "lesen" on public.einrichtblatt_app for select to authenticated using (public.darf_lesen());
drop policy if exists "anlegen" on public.einrichtblatt_app;
create policy "anlegen" on public.einrichtblatt_app for insert to authenticated
  with check (public.darf_schreiben() and not public.ist_extern());
drop policy if exists "aendern" on public.einrichtblatt_app;
create policy "aendern" on public.einrichtblatt_app for update to authenticated
  using (public.darf_schreiben() and not public.ist_extern())
  with check (public.darf_schreiben() and not public.ist_extern());
drop policy if exists "loeschen" on public.einrichtblatt_app;
create policy "loeschen" on public.einrichtblatt_app for delete to authenticated
  using (public.darf_schreiben() and not public.ist_extern());

-- Aufbau des SW-20 wie im bisherigen Excel „Werkzeug-Protokoll SW20“:
-- oben zwei Reihen mit Bild, links unten der Kopf, rechts davon drei
-- Reihen. Nur wenn noch nichts eingetragen ist.
update public.machine_types set blatt_aufbau = '{
  "geometrie": true,
  "reihen": [
    ["T100", "T200", "T300", "T400", "T1100", "T1200"],
    ["T500", "T600", "T700", "T1300", "T1400", "T1500"],
    [null, null, "T1600", "T1700", "T1800", "T1900"],
    [null, null, "T2100", "T2200", "T2300", "T2400"],
    [null, null, "T2500", "T2600", "T2700", "T2800"]
  ]
}'::jsonb
where name = 'SW-20' and blatt_aufbau is null;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle einrichtblatt_app' as punkt,
       case when to_regclass('public.einrichtblatt_app') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Spalte machine_types.blatt_aufbau',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'machine_types' and column_name = 'blatt_aufbau') then 'ok' else 'FEHLT' end
union all
select 'Spalte einrichtblatt_app.kopf',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'einrichtblatt_app' and column_name = 'kopf') then 'ok' else 'FEHLT' end
union all
select 'Aufbau SW-20',
       case when exists (select 1 from public.machine_types where name = 'SW-20' and blatt_aufbau is not null)
         then 'ok' else 'FEHLT' end;
