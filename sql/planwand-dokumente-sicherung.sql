-- =================================================================
--  PLANWAND DARF DOKUMENTE UND SICHERUNG
--
--  Was diese Datei tut, in einfachen Worten:
--  Das Konto "Planwand" (Rolle planwand, läuft am Pool-Rechner) darf
--  seit 111.123.0 alles, was mit Dokumente hochladen und mit der
--  Sicherung zu tun hat (Wunsch Patrick, 9. Oktober 2026). Hochladen
--  durfte es schon (Ablage zeichnungen, Tabelle dokumente). Neu darf es:
--    - unter Einstellungen → Dokumente die Ordner am Pool-Rechner
--      speichern (app_config: dok_pool_pfad, eb_ordner, zng_ordner)
--    - unter Einstellungen → Backup Uhrzeit, Behalten, Konto und das
--      Sicherungsgerät speichern (app_config: sicherung) und den Stand
--      melden (app_config: sicherung_status)
--    - sichern: alle Daten auf einmal lesen (sicherung_lesen) und die
--      Liste der hochgeladenen Dateien (sicherung_dateien)
--    - zurückspielen (sicherung_puffern, sicherung_einspielen), wie Admins
--  Alles andere in app_config (Farben, Symbole, Bestellmail, PIN) bleibt
--  bei Admins.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

-- Ist die angemeldete Person das Konto Planwand?
create or replace function public.bin_planwand() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and is_active = true and role = 'planwand');
$$;
revoke all on function public.bin_planwand() from public, anon;
grant execute on function public.bin_planwand() to authenticated;

-- ---------- Einstellungen zu Dokumenten und Sicherung ----------
drop policy if exists "planwand dokumente und sicherung" on public.app_config;
create policy "planwand dokumente und sicherung" on public.app_config for all to authenticated
  using (schluessel in ('dok_pool_pfad', 'eb_ordner', 'zng_ordner', 'sicherung', 'sicherung_status')
         and (select public.bin_planwand()))
  with check (schluessel in ('dok_pool_pfad', 'eb_ordner', 'zng_ordner', 'sicherung', 'sicherung_status')
         and (select public.bin_planwand()));

-- ---------- Lesen: alles in einem Zug (wie in sicherung-konto.sql) ----------
create or replace function public.sicherung_lesen()
returns json language plpgsql stable security definer set search_path = public as $$
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
  return array_to_json(alle);
end $$;
revoke all on function public.sicherung_lesen() from public, anon;
grant execute on function public.sicherung_lesen() to authenticated;

-- ---------- Liste der hochgeladenen Dateien (wie in sicherung-konto.sql) ----------
create or replace function public.sicherung_dateien()
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not (public.bin_admin() or public.bin_planwand() or public.bin_dienst() or public.sicherung_konto_ich()) then
    raise exception 'Nur Admins, Planwand und das Sicherungskonto dürfen sichern.';
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

-- ---------- Zurückspielen: Admin und Planwand immer (wie in sicherung.sql) ----------
-- Das Dienstkonto weiterhin nur mit offenem Auftrag "zurueck" eines Admins.
create or replace function public.sicherung_darf_einspielen()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare a jsonb;
begin
  if public.bin_admin() or public.bin_planwand() then return true; end if;
  if not public.bin_dienst() then return false; end if;
  begin
    select wert::jsonb into a from public.app_config where schluessel = 'sicherung_auftrag';
  exception when others then return false;
  end;
  return a is not null and a->>'art' = 'zurueck' and coalesce(a->>'erledigt', '') = ''
    and (a->>'zeit')::timestamptz > now() - interval '2 days';
end $$;
revoke all on function public.sicherung_darf_einspielen() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Rolle Planwand erkennen' as was,
       case when to_regprocedure('public.bin_planwand()') is not null then 'ok' else 'FEHLT' end as stand
union all select 'Einstellungen Dokumente und Sicherung',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'planwand dokumente und sicherung') then 'ok' else 'FEHLT' end
union all select 'Sichern mit Planwand',
       case when pg_get_functiondef('public.sicherung_lesen()'::regprocedure) like '%bin_planwand%'
             and pg_get_functiondef('public.sicherung_dateien()'::regprocedure) like '%bin_planwand%' then 'ok' else 'FEHLT' end
union all select 'Zurückspielen mit Planwand',
       case when pg_get_functiondef('public.sicherung_darf_einspielen()'::regprocedure) like '%bin_planwand%' then 'ok' else 'FEHLT' end;
