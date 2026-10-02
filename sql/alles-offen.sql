-- =================================================================
--  ALLES, WAS NOCH OFFEN IST — in einem Durchgang
--
--  Enthält, der Reihe nach:
--    1. Einrichtblatt als PDF, Stück am Abend, Info an der Maschine
--    2. Weitere Dokumente bei HOCO Nr. und Typ
--    3. Menge bei Teillieferung
--    4. Gehaltene Stückzahl beim Werkzeugwechsel
--    5. Wer zuletzt geändert hat
--    6. Rolle Extern samt Sperren in der Datenbank
--
--  Jeder Teil läuft gefahrlos mehrfach — was schon da ist, bleibt.
--  Nichts wird gelöscht.
--
--  So ausführen: im SQL-Editor alles markieren (Strg + A), Run.
--  Fragt Supabase nach "Row Level Security", auf
--  "Run and enable RLS" klicken.
--
--  Am Ende steht eine Tabelle: bei jedem Punkt muss "ok" stehen.
-- =================================================================



-- #################################################################
--  1. EINRICHTBLATT ALS PDF
-- #################################################################

-- =================================================================
--  EINRICHTBLATT ALS PDF
--
--  Zwei Spalten, mehr braucht es nicht:
--   · machine_types.blatt_url   — die Vorlage je Maschinentyp
--   · hoco_type_data.blatt_url  — das Blatt für genau eine HOCO Nr.
--     auf genau einem Typ; überschreibt die Vorlage
--
--  Dazu abend_stk, damit "Stück am Abend" dort mitläuft, und der
--  eindeutige Schlüssel für hoco_nr + type_id, den das Speichern
--  braucht.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

alter table public.machine_types   add column if not exists blatt_url text;
alter table public.hoco_type_data  add column if not exists blatt_url text;
alter table public.hoco_type_data  add column if not exists abend_stk integer;

-- Freier Text, der nur im Pad Mode an der Maschine erscheint. Hängt an
-- der HOCO Nr. und am Typ — läuft dasselbe Teil später wieder auf
-- diesem Typ, steht der Hinweis wieder da.
alter table public.hoco_type_data  add column if not exists pad_info text;

-- Je HOCO Nr. und Typ genau eine Zeile
do $$
begin
  if exists (select 1 from public.hoco_type_data
             group by hoco_nr, type_id having count(*) > 1) then
    raise notice 'hoco_type_data hat doppelte Einträge — Schlüssel nicht angelegt, siehe Probe';
  else
    create unique index if not exists idx_hoco_type_data_eindeutig
      on public.hoco_type_data (hoco_nr, type_id);
  end if;
end $$;

notify pgrst, 'reload schema';


-- #################################################################
--  2. DOKUMENTE
-- #################################################################

-- =================================================================
--  DOKUMENTE
--
--  Eine Tabelle für alle Dateien, die an einer HOCO Nr. oder an
--  einem Maschinentyp hängen: Zeichnungen, WBG, Einrichtblätter und
--  alles Weitere, was später dazukommt.
--
--  Die Art steht als Text drin, damit neue Arten keine Änderung an
--  der Datenbank brauchen. Heute verwendet die App:
--    zeichnung · wbg · einrichtblatt · sonstiges
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

create table if not exists public.dokumente (
  id          uuid primary key default gen_random_uuid(),
  art         text not null default 'sonstiges',
  hoco_nr     text,
  type_id     uuid references public.machine_types(id) on delete cascade,
  titel       text,
  dateiname   text,
  datei_url   text not null,
  groesse     bigint,
  notiz       text,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid references public.profiles(id) on delete set null
);

-- Schnell finden, was zu einer Nummer oder einem Typ gehört
create index if not exists idx_dokumente_hoco on public.dokumente (hoco_nr);
create index if not exists idx_dokumente_typ  on public.dokumente (type_id);
create index if not exists idx_dokumente_art  on public.dokumente (art);

-- Dieselbe Datei nicht zweimal
create unique index if not exists idx_dokumente_eindeutig
  on public.dokumente (coalesce(hoco_nr, ''), coalesce(type_id::text, ''), art, dateiname);

alter table public.dokumente enable row level security;

drop policy if exists "dokumente lesen" on public.dokumente;
create policy "dokumente lesen" on public.dokumente
  for select to authenticated using (true);

drop policy if exists "dokumente schreiben" on public.dokumente;
create policy "dokumente schreiben" on public.dokumente
  for all to authenticated using (true) with check (true);

-- Einrichtblatt als PDF, falls blattpdf.sql noch nicht gelaufen ist
alter table public.machine_types  add column if not exists blatt_url text;
alter table public.hoco_type_data add column if not exists blatt_url text;
alter table public.hoco_type_data add column if not exists abend_stk integer;
-- (Schlüssel für hoco_type_data kommt aus Teil 1)

notify pgrst, 'reload schema';


-- #################################################################
--  3. TEILLIEFERUNG
-- #################################################################

-- =================================================================
--  TEILLIEFERUNG MIT MENGE
--
--  Eine Spalte an den Bestellpositionen: wie viel von der bestellten
--  Menge schon geliefert ist. Die App fragt danach, sobald eine
--  Position auf "Teilweise geliefert" gesetzt wird, und zeigt in der
--  Liste "20 da · 30 offen".
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

alter table public.order_items add column if not exists geliefert_menge numeric;

notify pgrst, 'reload schema';


-- #################################################################
--  4. GEHALTENE STÜCKZAHL BEIM WERKZEUGWECHSEL
-- #################################################################

-- Wie viele Stück ein Werkzeug bis zum Wechsel gehalten hat. Die App
-- schreibt den Wert schon mit, bisher wurde er verworfen, weil die
-- Spalte fehlte.
alter table public.tool_changes add column if not exists gehalten_stk integer;
notify pgrst, 'reload schema';


-- #################################################################
--  5. WER ZULETZT GEÄNDERT HAT
-- #################################################################

-- =================================================================
--  WER HAT ZULETZT GEÄNDERT
--
--  Jeder Auftrag merkt sich, wer ihn zuletzt geändert hat und wann.
--  Das erledigt ein Auslöser in der Datenbank selbst — damit wird
--  alles erfasst, was am Auftrag selbst etwas ändert: Speichern im
--  Fenster, Verschieben, Verlängern, Nachrücken, Zustand im Pad Mode.
--  Eine Stückzahlmeldung ändert den Auftrag nicht, sie steht in einer
--  eigenen Tabelle — die zählt hier deshalb nicht als Änderung.
--  Die App zeigt das Kürzel auf dem Balken und Name und Zeit im
--  Infofenster.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

-- ---------- 1. Zwei Spalten ----------
alter table public.jobs add column if not exists geaendert_von uuid;
alter table public.jobs add column if not exists geaendert_am  timestamptz;


-- ---------- 2. Der Auslöser ----------
create or replace function public.jobs_geaendert_setzen()
returns trigger language plpgsql as $$
begin
  -- Wer angemeldet ist, steht drin; ohne Anmeldung (etwa ein Import im
  -- SQL-Editor) bleibt der bisherige Eintrag
  if auth.uid() is not null then
    new.geaendert_von := auth.uid();
  end if;
  new.geaendert_am := now();
  return new;
end $$;

drop trigger if exists jobs_geaendert on public.jobs;
create trigger jobs_geaendert
  before insert or update on public.jobs
  for each row execute function public.jobs_geaendert_setzen();


-- ---------- 3. Die Planwand-Sicht bekommt die zwei Spalten ----------
-- Die Sicht wird nicht neu geschrieben, sondern um die zwei Spalten
-- ergänzt. Was sie bisher liefert, bleibt genau gleich — auch der
-- Schutz für Externe.
do $$
declare
  d text;
  invoker boolean;
begin
  if to_regclass('public.planwand') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'planwand'
               and column_name = 'geaendert_von') then return; end if;

  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into invoker from pg_class c where c.oid = 'public.planwand'::regclass;

  d := rtrim(pg_get_viewdef('public.planwand'::regclass, true), E'; \n');
  execute 'create or replace view public.planwand as select v.*, '
       || 'jg.geaendert_von, jg.geaendert_am from (' || d || ') v '
       || 'left join public.jobs jg on jg.id = v.id';
  if invoker then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
end $$;

notify pgrst, 'reload schema';


-- #################################################################
--  6. ROLLE EXTERN
-- #################################################################

-- =================================================================
--  ROLLE EXTERN
--
--  Ein Login für externe Partner, etwa Zurbrügg. Die App zeigt ihnen
--  nur die Planwand ihrer Maschinen und das Erfassen der Stückzahlen.
--  Dieses Skript sorgt dafür, dass die Datenbank selbst genauso
--  streng ist — sonst könnte jemand mit etwas Wissen über die
--  Schnittstelle trotzdem alles lesen, was die App nur nicht anzeigt.
--
--  WICHTIG: Für alle anderen Rollen ändert sich nichts. Die Sperren
--  greifen ausschliesslich bei Personen mit der Rolle "extern".
--
--  Welche Maschinen ein Externer sieht:
--   · die Parks, die bei ihm in den Einstellungen unter "Zugriff auf
--     Maschinenparks" angehakt sind
--   · ohne Haken: Parks mit "extern", "Lohn" oder "fremd" im Namen
--
--  Läuft gefahrlos mehrfach.
-- =================================================================


-- ---------- 1. Die Rolle zulassen ----------
-- Falls die Tabelle nur bestimmte Rollen erlaubt, kommt "extern" dazu.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_check
  check (role is null or role in ('admin', 'planwand', 'langdreher', 'kurzdreher',
                                  'mitarbeiter', 'produktion', 'extern')) not valid;


-- ---------- 1b. Die Anmeldekacheln kennen die Rolle ----------
-- Damit auf euren Geräten keine Kachel für Externe erscheint, muss die
-- Kachelliste die Rolle mitliefern. Fehlt sie, wird sie angehängt —
-- alles andere an der Liste bleibt, wie es ist.
do $$
declare
  d text;
  schluessel text;
begin
  if to_regclass('public.login_kacheln') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'login_kacheln'
               and column_name = 'role') then return; end if;

  select case
    when exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'login_kacheln' and column_name = 'id') then 'id'
    when exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'login_kacheln' and column_name = 'email') then 'email'
  end into schluessel;
  if schluessel is null then
    raise notice 'login_kacheln hat weder id noch email — Rolle nicht angehängt';
    return;
  end if;

  d := rtrim(pg_get_viewdef('public.login_kacheln'::regclass, true), E'; \n');
  execute 'create or replace view public.login_kacheln as select k.*, p.role from ('
       || d || ') k left join public.profiles p on p.' || schluessel || ' = k.' || schluessel;
  raise notice 'login_kacheln: Rolle angehängt';
end $$;


-- ---------- 2. Hilfsfunktionen ----------
create or replace function public.ist_extern()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'extern' from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.extern_darf_park(k_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.machine_parks k
    join public.profiles p on p.id = auth.uid()
    where k.id = k_id
      -- funktioniert, egal ob die Parks als Liste oder als JSON gespeichert sind
      and case when jsonb_array_length(coalesce(to_jsonb(p.parks), '[]'::jsonb)) > 0
               then exists (select 1 from jsonb_array_elements_text(to_jsonb(p.parks)) e
                            where e = k.id::text)
               else k.name ~* '(extern|lohn|fremd)' end)
$$;

create or replace function public.extern_darf_maschine(m_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.machines x
                 where x.id = m_id and public.extern_darf_park(x.park_id))
$$;


-- ---------- 3. Zeilenschutz einschalten, wo er noch fehlt ----------
-- Hat eine Tabelle noch keinen Zeilenschutz, bekommt sie ihn — mit
-- einer Regel "alle wie bisher", damit sich für niemanden etwas ändert.
-- Erst danach greifen die Sperren für Externe.
do $$
declare
  t text;
  tabellen text[] := array[
    'jobs', 'production_records', 'machines', 'machine_parks', 'profiles',
    'order_items', 'articles', 'suppliers', 'vacations', 'hoco_parts',
    'hoco_type_data', 'dokumente', 'app_config', 'machine_types', 'tool_changes',
    'setup_sheets', 'setup_sheet_slots', 'shopping_items', 'todos', 'designations',
    'solar_werte', 'farb_material', 'fahrzeuge', 'fahrzeug_buchungen',
    'fahrzeug_probleme', 'chat_gespraeche', 'chat_nachrichten', 'chat_teilnehmer',
    'chat_gelesen', 'storage_locations', 'stock_balances', 'stock_movements',
    'notizen', 'notes', 'personen', 'game_scores', 'eier_zaehler', 'eier_historie',
    'people', 'type_slots', 'type_paths', 'tool_kinds', 'werkzeugwechsel',
    'einrichtblaetter', 'chat'];
begin
  foreach t in array tabellen loop
    if to_regclass('public.' || t) is null then continue; end if;
    -- Sichten haben keinen Zeilenschutz. Sie lesen ab jetzt mit den Rechten
    -- der angemeldeten Person — so greifen die Regeln der Tabellen darunter.
    if (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'v' then
      execute format('alter view public.%I set (security_invoker = true)', t);
      raise notice 'Sicht an die Regeln gebunden: %', t;
      continue;
    end if;
    if (select relkind from pg_class where oid = ('public.' || t)::regclass) not in ('r', 'p') then
      continue;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "alle wie bisher" on public.%I', t);
      execute format('create policy "alle wie bisher" on public.%I for all '
                     || 'to anon, authenticated using (true) with check (true)', t);
      raise notice 'Zeilenschutz eingeschaltet: %', t;
    end if;
  end loop;
end $$;


-- ---------- 4. Sperren für Externe ----------
-- "restrictive" heisst: gilt zusätzlich zu allen anderen Regeln. Für
-- alle, die nicht extern sind, ist die Bedingung immer erfüllt.
do $$
declare
  t text;
  gesperrt text[] := array[
    'order_items', 'articles', 'suppliers', 'vacations', 'hoco_parts',
    'hoco_type_data', 'dokumente', 'app_config', 'machine_types', 'tool_changes',
    'setup_sheets', 'setup_sheet_slots', 'shopping_items', 'todos', 'designations',
    'solar_werte', 'farb_material', 'fahrzeuge', 'fahrzeug_buchungen',
    'fahrzeug_probleme', 'chat_gespraeche', 'chat_nachrichten', 'chat_teilnehmer',
    'chat_gelesen', 'storage_locations', 'stock_balances', 'stock_movements',
    'notizen', 'notes', 'personen', 'game_scores', 'eier_zaehler', 'eier_historie',
    'people', 'type_slots', 'type_paths', 'tool_kinds', 'werkzeugwechsel',
    'einrichtblaetter', 'chat'];
begin
  -- Alles Übrige: für Externe ganz gesperrt
  foreach t in array gesperrt loop
    if to_regclass('public.' || t) is null then continue; end if;
    -- Nur echte Tabellen; Sichten sind oben schon an die Regeln gebunden
    if (select relkind from pg_class where oid = ('public.' || t)::regclass) not in ('r', 'p') then
      continue;
    end if;
    execute format('drop policy if exists "extern gesperrt" on public.%I', t);
    execute format('create policy "extern gesperrt" on public.%I as restrictive for all '
                   || 'to authenticated using (not public.ist_extern()) '
                   || 'with check (not public.ist_extern())', t);
  end loop;
end $$;

-- Aufträge: nur die auf eigenen Maschinen lesen, nichts anlegen oder löschen
drop policy if exists "extern nur eigene maschinen" on public.jobs;
create policy "extern nur eigene maschinen" on public.jobs as restrictive for select
  to authenticated using (not public.ist_extern() or public.extern_darf_maschine(machine_id));
drop policy if exists "extern aendert keine auftraege" on public.jobs;
create policy "extern aendert keine auftraege" on public.jobs as restrictive for update
  to authenticated using (not public.ist_extern()) with check (not public.ist_extern());
drop policy if exists "extern legt keine auftraege an" on public.jobs;
create policy "extern legt keine auftraege an" on public.jobs as restrictive for insert
  to authenticated with check (not public.ist_extern());
drop policy if exists "extern loescht keine auftraege" on public.jobs;
create policy "extern loescht keine auftraege" on public.jobs as restrictive for delete
  to authenticated using (not public.ist_extern());

-- Stückzahlen: lesen und melden, nur für eigene Maschinen
drop policy if exists "extern nur eigene stueckzahlen" on public.production_records;
create policy "extern nur eigene stueckzahlen" on public.production_records as restrictive for all
  to authenticated
  using (not public.ist_extern() or public.extern_darf_maschine(machine_id))
  with check (not public.ist_extern() or public.extern_darf_maschine(machine_id));

-- Maschinen und Parks: nur die eigenen sehen, nichts ändern
drop policy if exists "extern nur eigene maschinen" on public.machines;
create policy "extern nur eigene maschinen" on public.machines as restrictive for select
  to authenticated using (not public.ist_extern() or public.extern_darf_park(park_id));
drop policy if exists "extern aendert keine maschinen" on public.machines;
create policy "extern aendert keine maschinen" on public.machines as restrictive for update
  to authenticated using (not public.ist_extern()) with check (not public.ist_extern());
drop policy if exists "extern legt keine maschinen an" on public.machines;
create policy "extern legt keine maschinen an" on public.machines as restrictive for insert
  to authenticated with check (not public.ist_extern());
drop policy if exists "extern loescht keine maschinen" on public.machines;
create policy "extern loescht keine maschinen" on public.machines as restrictive for delete
  to authenticated using (not public.ist_extern());

drop policy if exists "extern nur eigene parks" on public.machine_parks;
create policy "extern nur eigene parks" on public.machine_parks as restrictive for select
  to authenticated using (not public.ist_extern() or public.extern_darf_park(id));
drop policy if exists "extern aendert keine parks" on public.machine_parks;
create policy "extern aendert keine parks" on public.machine_parks as restrictive for update
  to authenticated using (not public.ist_extern()) with check (not public.ist_extern());

-- Personen: Externe sehen nur sich selbst
drop policy if exists "extern nur sich selbst" on public.profiles;
create policy "extern nur sich selbst" on public.profiles as restrictive for select
  to authenticated using (not public.ist_extern() or id = auth.uid());
drop policy if exists "extern aendert nur sich selbst" on public.profiles;
create policy "extern aendert nur sich selbst" on public.profiles as restrictive for update
  to authenticated using (not public.ist_extern() or id = auth.uid())
  with check (not public.ist_extern() or (id = auth.uid() and role = 'extern'));


-- ---------- 5. Die Planwand-Sicht an die Regeln binden ----------
-- Eine Sicht liest sonst mit den Rechten ihres Besitzers und würde die
-- Sperren umgehen. Mit security_invoker liest sie mit den Rechten der
-- angemeldeten Person — für alle anderen ändert sich dabei nichts.
do $$
begin
  if to_regclass('public.planwand') is not null then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
  -- Auch die Artikelübersicht, sonst kämen Externe darüber an Artikel
  if to_regclass('public.artikel_uebersicht') is not null then
    execute 'alter view public.artikel_uebersicht set (security_invoker = true)';
  end if;
end $$;

notify pgrst, 'reload schema';


-- #################################################################
--  PROBE — bei jedem Punkt muss "ok" stehen
-- #################################################################

with pruef(nr, punkt, ok) as (values
  (1, 'Einrichtblatt: machine_types.blatt_url',
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'machine_types' and column_name = 'blatt_url')),
  (2, 'Stück am Abend: hoco_type_data.abend_stk',
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'hoco_type_data' and column_name = 'abend_stk')),
  (3, 'Info an der Maschine: hoco_type_data.pad_info',
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'hoco_type_data' and column_name = 'pad_info')),
  (4, 'Schlüssel HOCO Nr. + Typ',
      exists (select 1 from pg_indexes where schemaname = 'public'
              and indexname = 'idx_hoco_type_data_eindeutig')),
  (5, 'Tabelle dokumente',
      to_regclass('public.dokumente') is not null),
  (6, 'Teillieferung: order_items.geliefert_menge',
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'order_items' and column_name = 'geliefert_menge')),
  (7, 'Werkzeugwechsel: tool_changes.gehalten_stk',
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'tool_changes' and column_name = 'gehalten_stk')),
  (8, 'Zuletzt geändert: Auslöser',
      exists (select 1 from pg_trigger where tgname = 'jobs_geaendert')),
  (9, 'Zuletzt geändert: Planwand liefert es',
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'planwand' and column_name = 'geaendert_von')),
  (10, 'Extern: Rolle erlaubt',
      exists (select 1 from pg_constraint where conname = 'profiles_role_check')),
  (11, 'Extern: Sperren auf Aufträgen',
      exists (select 1 from pg_policy where polname = 'extern nur eigene maschinen'
              and polrelid = 'public.jobs'::regclass)),
  (12, 'Extern: Planwand an die Regeln gebunden',
      coalesce((select 'security_invoker=true' = any (reloptions) from pg_class
                where oid = to_regclass('public.planwand')), false)),
  (13, 'Extern: Anmeldekacheln kennen die Rolle',
      to_regclass('public.login_kacheln') is null or
      exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'login_kacheln' and column_name = 'role'))
)
select nr, punkt, case when ok then 'ok' else 'FEHLT' end as ergebnis
from pruef
union all
select 99, 'Doppelte Einträge HOCO Nr. + Typ (sollten 0 sein)',
       (select count(*)::text from (select 1 from public.hoco_type_data
         group by hoco_nr, type_id having count(*) > 1) d)
order by nr;
