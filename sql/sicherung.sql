-- =================================================================
--  SICHERUNG UND ZURÜCKSPIELEN
--
--  Was diese Datei tut, in einfachen Worten:
--   - Das Programm sicherung.ps1 auf dem Rechner im Betrieb darf mit dem
--     Dienstkonto alle Daten der App auf einmal lesen (sicherung_lesen)
--     und die Liste der hochgeladenen Dateien (sicherung_dateien).
--     Es legt beides in den Ordner, der in der App unter
--     Einstellungen → Backup steht.
--   - Zurückspielen: Ein Admin wählt in der App eine Sicherung. Das
--     Programm lädt sie hoch (sicherung_puffern) und lässt die Datenbank
--     alles in einem Zug ersetzen (sicherung_einspielen). Klappt etwas
--     nicht, bleibt alles wie vorher. Das Dienstkonto darf das nur,
--     wenn ein Admin es in der App angefordert hat, und nur einmal.
--   - Das Dienstkonto darf seinen Stand unter "sicherung_status" melden.
--
--  Die Anmeldekonten (Passwörter) sind nicht Teil der Sicherung: Sie
--  bleiben im selben Projekt sowieso erhalten.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

-- ---------- Zwischenablage fürs Zurückspielen ----------
create table if not exists public.sicherung_puffer (
  lauf     uuid not null,
  tabelle  text not null,
  zeilen   jsonb not null,
  am       timestamptz not null default now(),
  primary key (lauf, tabelle)
);
alter table public.sicherung_puffer enable row level security;
-- Keine Regel: nur die Funktionen unten kommen daran
revoke all on public.sicherung_puffer from anon, authenticated;

-- Welche Tabellen zur Sicherung gehören: alle der App, ausser der
-- Zwischenablage selbst, der PINs (pin_schutz) und des Solar-Schlüssels
-- (solar_zugang): Geheimnisse gehören nicht in Dateien auf dem
-- Netzlaufwerk, und sie sollen beim Zurückspielen bleiben, wie sie sind.
create or replace function public.sicherung_tabellenliste()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and c.relname not in ('sicherung_puffer', 'pin_schutz', 'solar_zugang');
$$;
revoke all on function public.sicherung_tabellenliste() from public, anon, authenticated;

-- ---------- Lesen: alles in einem Zug ----------
-- Ein einziger Aufruf, damit alle Tabellen denselben Augenblick zeigen
-- (sonst könnte ein Auftrag fehlen, dessen Stückzahlen schon drin sind).
-- Je Tabelle {"t": Name, "nr": Anzahl, "zeilen": [...]}. Das Programm
-- teilt die Antwort an "t" auf, ohne alles einlesen zu müssen. Die
-- Namen sind so gewählt, dass die Reihenfolge t, nr, zeilen auch dann
-- bleibt, wenn unterwegs json zu jsonb wird (jsonb ordnet nach Länge).
create or replace function public.sicherung_lesen()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  t text;
  teil json;
  alle json[] := '{}';
begin
  if not (public.bin_admin() or public.bin_dienst()) then
    raise exception 'Nur Admins und das Dienstkonto dürfen sichern.';
  end if;
  foreach t in array public.sicherung_tabellenliste() loop
    execute format(
      'select json_build_object(''t'', %L, ''nr'', count(*), ''zeilen'', coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb)) from public.%I x',
      t, t) into teil;
    alle := alle || teil;
  end loop;
  return array_to_json(alle);
end $$;
revoke all on function public.sicherung_lesen() from public, anon;
grant execute on function public.sicherung_lesen() to authenticated;

-- ---------- Liste der hochgeladenen Dateien ----------
create or replace function public.sicherung_dateien()
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not (public.bin_admin() or public.bin_dienst()) then
    raise exception 'Nur Admins und das Dienstkonto dürfen sichern.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'b', o.bucket_id, 'p', o.name,
             'g', coalesce((o.metadata->>'size')::bigint, 0),
             'a', coalesce(o.metadata->>'mimetype', '')) order by o.bucket_id, o.name)
    from storage.objects o
    where o.name is not null and right(o.name, 1) <> '/'
      and o.name not like '%.emptyFolderPlaceholder'), '[]'::jsonb);
end $$;
revoke all on function public.sicherung_dateien() from public, anon;
grant execute on function public.sicherung_dateien() to authenticated;

-- ---------- Darf zurückgespielt werden? ----------
-- Admin immer. Das Dienstkonto nur, wenn unter "sicherung_auftrag" ein
-- offener Auftrag "zurueck" eines Admins steht (den darf nur ein Admin
-- schreiben) und er nicht älter als zwei Tage ist.
create or replace function public.sicherung_darf_einspielen()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare a jsonb;
begin
  if public.bin_admin() then return true; end if;
  if not public.bin_dienst() then return false; end if;
  begin
    select wert::jsonb into a from public.app_config where schluessel = 'sicherung_auftrag';
  exception when others then return false;
  end;
  return a is not null and a->>'art' = 'zurueck' and coalesce(a->>'erledigt', '') = ''
    and (a->>'zeit')::timestamptz > now() - interval '2 days';
end $$;
revoke all on function public.sicherung_darf_einspielen() from public, anon, authenticated;

-- ---------- Zurückspielen, Schritt 1: Tabelle für Tabelle hochladen ----------
create or replace function public.sicherung_puffern(p_lauf uuid, p_tabelle text, p_zeilen jsonb)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.sicherung_darf_einspielen() then
    raise exception 'Zurückspielen ist nicht angefordert (Einstellungen → Backup).';
  end if;
  if jsonb_typeof(p_zeilen) <> 'array' then raise exception 'Zeilen müssen eine Liste sein.'; end if;
  delete from public.sicherung_puffer where am < now() - interval '1 day';
  insert into public.sicherung_puffer (lauf, tabelle, zeilen) values (p_lauf, p_tabelle, p_zeilen)
    on conflict (lauf, tabelle) do update set zeilen = excluded.zeilen, am = now();
  return jsonb_array_length(p_zeilen);
end $$;
revoke all on function public.sicherung_puffern(uuid, text, jsonb) from public, anon;
grant execute on function public.sicherung_puffern(uuid, text, jsonb) to authenticated;

-- ---------- Zurückspielen, Schritt 2: alles in einem Zug ersetzen ----------
-- p_tabellen = [{"t": "jobs", "n": 2520}, …] aus dem Kopf der Sicherung.
-- Alles läuft in einer Transaktion: Scheitert irgendetwas, bleibt die
-- Datenbank genau wie vorher.
--  - Auslöser (Trigger) der App sind währenddessen aus, sonst würden sie
--    die zurückgespielten Zeilen verändern (Zeichnung anheften usw.).
--  - Verweise zwischen Tabellen werden erst am Schluss geprüft, darum
--    spielt die Reihenfolge keine Rolle.
--  - Spalten, die es damals noch nicht gab, bekommen ihren Standardwert.
--    Tabellen, die es damals noch nicht gab, bleiben unberührt.
--  - Die Einträge sicherung* in app_config (Speicherort, Auftrag, Stand)
--    bleiben, wie sie jetzt sind.
create or replace function public.sicherung_einspielen(p_lauf uuid, p_tabellen jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  liste text[];
  erlaubt text[] := public.sicherung_tabellenliste();
  e jsonb;
  t text;
  n int;
  da int;
  spalten text;
  summe bigint := 0;
  k record;
  verzoegert text[] := '{}';
  behalten jsonb;
  weg uuid[] := '{}';
begin
  if not public.sicherung_darf_einspielen() then
    raise exception 'Zurückspielen ist nicht angefordert (Einstellungen → Backup).';
  end if;

  -- Vollständig hochgeladen?
  liste := '{}';
  for e in select * from jsonb_array_elements(p_tabellen) loop
    t := e->>'t';
    if not (t = any (erlaubt)) then continue; end if;
    n := (e->>'n')::int;
    select jsonb_array_length(zeilen) into da from public.sicherung_puffer where lauf = p_lauf and tabelle = t;
    if da is null or da <> n then
      raise exception 'Sicherung unvollständig hochgeladen: % (% statt % Zeilen)', t, coalesce(da, 0), n;
    end if;
    liste := liste || t;
  end loop;
  if cardinality(liste) = 0 then raise exception 'Die Sicherung enthält keine Tabellen.'; end if;

  -- Was in app_config zur Sicherung selbst gehört, bleibt
  behalten := coalesce((select jsonb_agg(to_jsonb(c)) from public.app_config c
                        where c.schluessel like 'sicherung%'), '[]'::jsonb);

  -- Verweise erst am Schluss prüfen
  for k in
    select c.conname, c.conrelid::regclass as tab from pg_constraint c
    where c.contype = 'f' and not c.condeferrable
      and c.conrelid in (select format('public.%I', x)::regclass from unnest(liste) x)
  loop
    execute format('alter table %s alter constraint %I deferrable initially deferred', k.tab, k.conname);
    verzoegert := verzoegert || (k.tab::text || '|' || k.conname);
  end loop;
  set constraints all deferred;

  foreach t in array liste loop
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  execute 'truncate table ' || (select string_agg(format('public.%I', x), ', ') from unnest(liste) x);

  foreach t in array liste loop
    -- Nur Spalten, die es heute gibt UND die in der Sicherung stehen
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into spalten
    from pg_attribute a
    where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped
      and a.attgenerated = ''
      and exists (select 1 from public.sicherung_puffer p
                  where p.lauf = p_lauf and p.tabelle = t and jsonb_array_length(p.zeilen) > 0
                    and (p.zeilen->0) ? a.attname::text);
    if spalten is not null then
      execute format(
        'insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, (select zeilen from public.sicherung_puffer where lauf = $1 and tabelle = $2))',
        t, spalten, spalten, t) using p_lauf, t;
      get diagnostics da = row_count;
      summe := summe + da;
    end if;
  end loop;

  -- Zähler (fortlaufende Nummern) hinter die höchste Nummer stellen
  for k in
    select c.relname as tab, a.attname as spalte, pg_get_serial_sequence(format('public.%I', c.relname), a.attname) as folge
    from pg_class c join pg_attribute a on a.attrelid = c.oid
    where c.relnamespace = 'public'::regnamespace and c.relname = any (liste)
      and a.attnum > 0 and not a.attisdropped
      and pg_get_serial_sequence(format('public.%I', c.relname), a.attname) is not null
  loop
    execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)',
      k.folge, k.spalte, k.tab);
  end loop;

  if 'app_config' = any (liste) then
    delete from public.app_config where schluessel like 'sicherung%';
    insert into public.app_config select * from jsonb_populate_recordset(null::public.app_config, behalten);
  end if;

  -- Personen, deren Anmeldekonto seit der Sicherung gelöscht wurde,
  -- kann es ohne Konto nicht geben. Sie bleiben weg; wo sie eingetragen
  -- sind (erstellt von usw.), wird das Feld leer, Pflichtfelder nehmen
  -- die Zeile mit. Sonst liesse sich so eine Sicherung nie zurückspielen.
  if 'profiles' = any (liste) then
    with d as (delete from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id) returning p.id)
    select coalesce(array_agg(id), '{}') into weg from d;
    if cardinality(weg) > 0 then
      for k in
        select c.conrelid::regclass as tab, a.attname as spalte, a.attnotnull as pflicht
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and cardinality(c.conkey) = 1
          and c.conrelid in (select format('public.%I', x)::regclass from unnest(liste) x)
      loop
        if k.pflicht then
          execute format('delete from %s where %I = any ($1)', k.tab, k.spalte) using weg;
        else
          execute format('update %s set %I = null where %I = any ($1)', k.tab, k.spalte, k.spalte) using weg;
        end if;
      end loop;
    end if;
  end if;

  -- Jetzt alle Verweise prüfen, dann alles wieder wie vorher (erst nach
  -- der Prüfung, vorher lässt Postgres die Tabellen nicht ändern)
  set constraints all immediate;
  foreach t in array liste loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;
  foreach t in array verzoegert loop
    execute format('alter table %s alter constraint %I not deferrable', split_part(t, '|', 1), split_part(t, '|', 2));
  end loop;

  delete from public.sicherung_puffer where lauf = p_lauf;

  -- Auftrag gilt als erledigt, damit er nicht ein zweites Mal läuft
  update public.app_config
    set wert = (wert::jsonb || jsonb_build_object('erledigt', now()))::text
    where schluessel = 'sicherung_auftrag';

  return jsonb_build_object('tabellen', cardinality(liste), 'zeilen', summe, 'ohne_konto', cardinality(weg));
end $$;
revoke all on function public.sicherung_einspielen(uuid, jsonb) from public, anon;
grant execute on function public.sicherung_einspielen(uuid, jsonb) to authenticated;

-- ---------- Stand melden ----------
drop policy if exists "dienst meldet sicherung" on public.app_config;
create policy "dienst meldet sicherung" on public.app_config for all
  using (schluessel = 'sicherung_status' and (select public.bin_dienst()))
  with check (schluessel = 'sicherung_status' and (select public.bin_dienst()));

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Zwischenablage' as was,
       case when to_regclass('public.sicherung_puffer') is not null then 'ok' else 'FEHLT' end as stand
union all select 'Lesen',
       case when to_regprocedure('public.sicherung_lesen()') is not null then 'ok' else 'FEHLT' end
union all select 'Dateiliste',
       case when to_regprocedure('public.sicherung_dateien()') is not null then 'ok' else 'FEHLT' end
union all select 'Zurückspielen',
       case when to_regprocedure('public.sicherung_einspielen(uuid, jsonb)') is not null
             and to_regprocedure('public.sicherung_puffern(uuid, text, jsonb)') is not null then 'ok' else 'FEHLT' end
union all select 'Stand melden',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'dienst meldet sicherung') then 'ok' else 'FEHLT' end;
