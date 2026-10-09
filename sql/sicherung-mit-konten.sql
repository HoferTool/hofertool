-- =================================================================
--  SICHERUNG MIT KONTEN — Anmeldung, Passwort und PIN kommen mit
--
--  Wunsch Patrick, 9. Oktober 2026: „das Schlimmste wäre, wenn alles weg
--  wäre, heisst auch Nutzer“, Entscheid „Konten mitsichern“.
--
--  Was diese Datei macht:
--    1. Die Sicherung (sicherung_lesen) nimmt zusätzlich die Konten mit:
--       auth.users (E-Mail, verschlüsseltes Passwort), auth.identities
--       (gehört zur Anmeldung), pin_schutz (verschlüsselte PIN) und
--       solar_zugang (Schlüssel des Solar-Rechners).
--       Passwörter und PINs liegen nur verschlüsselt in der ZIP-Datei,
--       lesen kann sie niemand.
--    2. Beim Zurückspielen kommen Konten, die es nicht mehr gibt, wieder,
--       ebenso der Solar-Schlüssel, wenn keiner mehr da ist.
--       Vorhandene Konten bleiben, wie sie sind (ein seither geändertes
--       Passwort wird nicht zurückgedreht).
--    3. Zurückspielen geht jetzt auch ohne App, direkt im SQL Editor
--       (für den Fall, dass niemand mehr hineinkommt). Erlaubt ist das
--       nur dort, nicht über die App-Schnittstelle.
--    4. Sind beim Zurückspielen auch die Einstellungen der Sicherung weg,
--       kommen sie aus der Sicherung wieder (vorher gingen sie verloren).
--
--  Gefahrlos mehrfach ausführbar. Ältere Sicherungen ohne Konten lassen
--  sich weiter zurückspielen.
-- =================================================================

-- ---------- 1. Sichern: Konten dazu ----------
create or replace function public.sicherung_lesen()
returns json
language plpgsql
stable security definer
set search_path = public
as $$
declare
  t text;
  teil json;
  alle json[] := '{}';
begin
  if not (public.bin_admin() or public.bin_planwand() or public.bin_dienst() or public.sicherung_konto_ich()) then
    raise exception 'Nur Admins, Planwand und das Sicherungskonto dürfen sichern.';
  end if;
  foreach t in array public.sicherung_tabellenliste() loop
    execute format(
      'select json_build_object(''t'', %L, ''nr'', count(*), ''zeilen'', coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb)) from public.%I x',
      t, t) into teil;
    alle := alle || teil;
  end loop;
  -- Konten (Wunsch Patrick, 9. Oktober 2026): Anmeldung, Passwort, PIN
  select json_build_object('t', 'auth.users', 'nr', count(*), 'zeilen', coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb))
    into teil from auth.users u;
  alle := alle || teil;
  select json_build_object('t', 'auth.identities', 'nr', count(*), 'zeilen', coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb))
    into teil from auth.identities i;
  alle := alle || teil;
  select json_build_object('t', 'pin_schutz', 'nr', count(*), 'zeilen', coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb))
    into teil from public.pin_schutz p;
  alle := alle || teil;
  select json_build_object('t', 'solar_zugang', 'nr', count(*), 'zeilen', coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb))
    into teil from public.solar_zugang s;
  alle := alle || teil;
  return array_to_json(alle);
end $$;
revoke all on function public.sicherung_lesen() from public, anon;
grant execute on function public.sicherung_lesen() to authenticated;

-- ---------- 3. Wer darf zurückspielen ----------
-- Neu: wer direkt im SQL Editor arbeitet (Anmeldung als postgres). Über
-- die App-Schnittstelle ist die Anmeldung immer „authenticator“, darum
-- kommt dort niemand so herein.
create or replace function public.sicherung_darf_einspielen()
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare a jsonb;
begin
  if session_user in ('postgres', 'supabase_admin') then return true; end if;
  if public.bin_admin() or public.bin_planwand() then return true; end if;
  if not public.bin_dienst() then return false; end if;
  begin
    select wert::jsonb into a from public.app_config where schluessel = 'sicherung_auftrag';
  exception when others then return false;
  end;
  return a is not null and a->>'art' = 'zurueck' and coalesce(a->>'erledigt', '') = ''
    and (a->>'zeit')::timestamptz > now() - interval '2 days';
end $$;

-- ---------- 2. Fehlende Zeilen aus dem Puffer einfügen ----------
-- Fügt nur ein, was es noch nicht gibt (on conflict do nothing), und nur
-- Spalten, die es heute gibt und die in der Sicherung stehen.
create or replace function public.sicherung_fehlende_einfuegen(p_lauf uuid, p_tabelle text, p_ziel regclass)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  spalten text;
  n int := 0;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into spalten
  from pg_attribute a
  where a.attrelid = p_ziel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and exists (select 1 from public.sicherung_puffer p
                where p.lauf = p_lauf and p.tabelle = p_tabelle and jsonb_array_length(p.zeilen) > 0
                  and (p.zeilen->0) ? a.attname::text);
  if spalten is null then return 0; end if;
  execute format(
    'insert into %s (%s) select %s from jsonb_populate_recordset(null::%s, (select zeilen from public.sicherung_puffer where lauf = $1 and tabelle = $2)) on conflict do nothing',
    p_ziel, spalten, spalten, p_ziel) using p_lauf, p_tabelle;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.sicherung_fehlende_einfuegen(uuid, text, regclass) from public, anon, authenticated;

-- ---------- Zurückspielen ----------
create or replace function public.sicherung_einspielen(p_lauf uuid, p_tabellen jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  liste text[];
  erlaubt text[] := public.sicherung_tabellenliste();
  konten text[] := array['auth.users', 'auth.identities', 'pin_schutz', 'solar_zugang'];
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
  neu_konten int := 0;
begin
  if not public.sicherung_darf_einspielen() then
    raise exception 'Zurückspielen ist nicht angefordert (Einstellungen → Backup).';
  end if;

  -- Vollständig hochgeladen?
  liste := '{}';
  for e in select * from jsonb_array_elements(p_tabellen) loop
    t := e->>'t';
    if not (t = any (erlaubt) or t = any (konten)) then continue; end if;
    n := (e->>'n')::int;
    select jsonb_array_length(zeilen) into da from public.sicherung_puffer where lauf = p_lauf and tabelle = t;
    if da is null or da <> n then
      raise exception 'Sicherung unvollständig hochgeladen: % (% statt % Zeilen)', t, coalesce(da, 0), n;
    end if;
    if t = any (erlaubt) then liste := liste || t; end if;
  end loop;
  if cardinality(liste) = 0 then raise exception 'Die Sicherung enthält keine Tabellen.'; end if;

  -- Konten, die es nicht mehr gibt, wieder anlegen (vorhandene bleiben).
  -- Zuerst, damit die Personen (profiles) unten ihr Konto finden.
  if exists (select 1 from public.sicherung_puffer where lauf = p_lauf and tabelle = 'auth.users') then
    neu_konten := public.sicherung_fehlende_einfuegen(p_lauf, 'auth.users', 'auth.users'::regclass);
    perform public.sicherung_fehlende_einfuegen(p_lauf, 'auth.identities', 'auth.identities'::regclass);
  end if;
  if exists (select 1 from public.sicherung_puffer where lauf = p_lauf and tabelle = 'pin_schutz') then
    perform public.sicherung_fehlende_einfuegen(p_lauf, 'pin_schutz', 'public.pin_schutz'::regclass);
  end if;
  -- Solar-Schlüssel (nur wenn keiner mehr da ist)
  if exists (select 1 from public.sicherung_puffer where lauf = p_lauf and tabelle = 'solar_zugang')
     and not exists (select 1 from public.solar_zugang) then
    perform public.sicherung_fehlende_einfuegen(p_lauf, 'solar_zugang', 'public.solar_zugang'::regclass);
    perform setval(pg_get_serial_sequence('public.solar_zugang', 'id'), coalesce((select max(id) from public.solar_zugang), 0) + 1, false);
  end if;

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

  -- Einstellungen der Sicherung: die heutigen bleiben. Sind keine mehr da
  -- (alles gelöscht), gelten die aus der Sicherung.
  if 'app_config' = any (liste) and jsonb_array_length(behalten) > 0 then
    delete from public.app_config where schluessel like 'sicherung%';
    insert into public.app_config select * from jsonb_populate_recordset(null::public.app_config, behalten);
  end if;

  -- Personen, deren Anmeldekonto fehlt (auch nicht in der Sicherung),
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

  -- Jetzt alle Verweise prüfen, dann alles wieder wie vorher
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

  return jsonb_build_object('tabellen', cardinality(liste), 'zeilen', summe, 'ohne_konto', cardinality(weg),
    'konten_neu', neu_konten);
end $$;
revoke all on function public.sicherung_einspielen(uuid, jsonb) from public, anon;
grant execute on function public.sicherung_einspielen(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- Probe
select 'Sicherung nimmt Konten mit' as was,
       case when pg_get_functiondef('public.sicherung_lesen()'::regprocedure) like '%auth.users%' then 'ok' else 'FEHLT' end as stand
union all
select 'Zurückspielen legt Konten an',
       case when pg_get_functiondef('public.sicherung_einspielen(uuid, jsonb)'::regprocedure) like '%sicherung_fehlende_einfuegen%' then 'ok' else 'FEHLT' end
union all
select 'Zurückspielen im SQL Editor',
       case when pg_get_functiondef('public.sicherung_darf_einspielen()'::regprocedure) like '%session_user%' then 'ok' else 'FEHLT' end;
