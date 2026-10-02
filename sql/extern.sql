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


-- ---------- 6. Probe ----------
select c.relname as tabelle,
       case when c.relrowsecurity then 'an' else 'AUS' end as zeilenschutz,
       count(p.polname) filter (where p.polname like 'extern%') as sperren_extern
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by (count(p.polname) filter (where p.polname like 'extern%')) = 0 desc, c.relname;
