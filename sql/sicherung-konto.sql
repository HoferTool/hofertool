-- =================================================================
--  SICHERUNG AUCH MIT DEM KONTO DES POOL-RECHNERS
--
--  Was diese Datei tut, in einfachen Worten:
--  Die tägliche Sicherung macht die App selbst (seit 111.109.0). Auf dem
--  Pool-Rechner ist aber nicht ein Admin angemeldet, sondern das Konto
--  "Planwand" (Wunsch Patrick 8. Oktober 2026: "der hat kein Admin, aber
--  mir ist das egal"). Unter Einstellungen → Backup wählt ein Admin das
--  Konto, das sichern darf (app_config.sicherung.konto). Dieses eine
--  Konto darf danach:
--    - alle Daten auf einmal lesen (sicherung_lesen)
--    - die Liste der hochgeladenen Dateien lesen (sicherung_dateien)
--    - den Stand der Sicherung melden (app_config.sicherung_status)
--  Zurückspielen dürfen weiterhin nur Admins.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

-- Ist die angemeldete Person das gewählte Sicherungskonto?
create or replace function public.sicherung_konto_ich()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (c.wert::jsonb ->> 'konto') = auth.uid()::text
    from public.app_config c where c.schluessel = 'sicherung'
  ), false);
$$;
revoke all on function public.sicherung_konto_ich() from public, anon;
grant execute on function public.sicherung_konto_ich() to authenticated;

-- ---------- Lesen: alles in einem Zug (wie in sicherung.sql) ----------
create or replace function public.sicherung_lesen()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  t text;
  teil json;
  alle json[] := '{}';
begin
  if not (public.bin_admin() or public.bin_dienst() or public.sicherung_konto_ich()) then
    raise exception 'Nur Admins und das Sicherungskonto dürfen sichern.';
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

-- ---------- Liste der hochgeladenen Dateien (wie in sicherung.sql) ----------
create or replace function public.sicherung_dateien()
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not (public.bin_admin() or public.bin_dienst() or public.sicherung_konto_ich()) then
    raise exception 'Nur Admins und das Sicherungskonto dürfen sichern.';
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

-- ---------- Stand melden ----------
drop policy if exists "sicherungskonto meldet" on public.app_config;
create policy "sicherungskonto meldet" on public.app_config for all to authenticated
  using (schluessel = 'sicherung_status' and (select public.sicherung_konto_ich()))
  with check (schluessel = 'sicherung_status' and (select public.sicherung_konto_ich()));

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Sicherungskonto' as was,
       case when to_regprocedure('public.sicherung_konto_ich()') is not null then 'ok' else 'FEHLT' end as stand
union all select 'Lesen mit Sicherungskonto',
       case when pg_get_functiondef('public.sicherung_lesen()'::regprocedure) like '%sicherung_konto_ich%' then 'ok' else 'FEHLT' end
union all select 'Dateiliste mit Sicherungskonto',
       case when pg_get_functiondef('public.sicherung_dateien()'::regprocedure) like '%sicherung_konto_ich%' then 'ok' else 'FEHLT' end
union all select 'Stand melden',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'sicherungskonto meldet') then 'ok' else 'FEHLT' end;
