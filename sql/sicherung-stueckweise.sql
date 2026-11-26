-- Sicherung stückweise (seit 1.870.0, 26. November 2026)
--
-- Warum: sicherung_lesen() las alle Tabellen auf einmal in den Speicher,
-- samt der grossen Tabelle imp_roh (rund 430 MB). Ab 25. November 2026
-- reichte der Speicher dafür nicht mehr, die Datenbank stürzte beim
-- Sichern immer wieder ab.
--
-- Was: sicherung_liste() nennt die Tabellen der Sicherung.
-- sicherung_teil(tabelle, ab) liefert eine Tabelle in kleinen Stücken
-- (höchstens rund 3 MB oder 4'000 Zeilen je Aufruf), gelesen Block für
-- Block nach ctid. Die App ruft so lange, bis "weiter" leer ist, mit
-- kurzen Pausen dazwischen. Gleiche Rechte wie sicherung_lesen().
-- Gefahrlos mehrfach ausführbar.

create or replace function public.sicherung_liste()
returns text[] language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (public.bin_admin() or public.bin_planwand() or public.bin_dienst() or public.sicherung_konto_ich()) then
    raise exception 'Nur Admins, Planwand und das Sicherungskonto dürfen sichern.';
  end if;
  return public.sicherung_tabellenliste() || array['auth.users', 'auth.identities', 'pin_schutz', 'solar_zugang'];
end $$;

create or replace function public.sicherung_teil(p_tabelle text, p_ab text default null)
returns json language plpgsql stable security definer set search_path to 'public' set statement_timeout to '60s' as $$
declare
  rel regclass;
  bloecke bigint;
  ab tid;
  bis tid;
  b bigint;
  r record;
  aus text[] := '{}';
  groesse bigint := 0;
  n int := 0;
begin
  if not (public.bin_admin() or public.bin_planwand() or public.bin_dienst() or public.sicherung_konto_ich()) then
    raise exception 'Nur Admins, Planwand und das Sicherungskonto dürfen sichern.';
  end if;
  if p_tabelle = 'auth.users' then rel := 'auth.users'::regclass;
  elsif p_tabelle = 'auth.identities' then rel := 'auth.identities'::regclass;
  elsif p_tabelle in ('pin_schutz', 'solar_zugang') or p_tabelle = any(public.sicherung_tabellenliste()) then
    rel := ('public.' || quote_ident(p_tabelle))::regclass;
  else
    raise exception 'Unbekannte Tabelle %', p_tabelle;
  end if;
  bloecke := pg_relation_size(rel) / current_setting('block_size')::int;
  ab := coalesce(nullif(p_ab, ''), '(0,0)')::tid;
  b := (ab::text::point)[0]::bigint;
  loop
    exit when b >= bloecke;
    bis := format('(%s,0)', b + 16)::tid;
    for r in execute format('select ctid c, to_jsonb(x)::text j from %s x where ctid > $1 and ctid < $2 order by ctid', rel)
      using ab, bis loop
      aus := aus || r.j;
      groesse := groesse + length(r.j);
      n := n + 1;
      if groesse > 3000000 or n >= 4000 then
        return json_build_object('zeilen', ('[' || array_to_string(aus, ',') || ']')::json, 'weiter', r.c::text);
      end if;
    end loop;
    b := b + 16;
    ab := format('(%s,0)', b)::tid;
  end loop;
  return json_build_object('zeilen', ('[' || array_to_string(aus, ',') || ']')::json, 'weiter', null);
end $$;

revoke all on function public.sicherung_teil(text, text) from public, anon;
revoke all on function public.sicherung_liste() from public, anon;
grant execute on function public.sicherung_teil(text, text) to authenticated;
grant execute on function public.sicherung_liste() to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'sicherung_teil')
             and exists (select 1 from pg_proc where proname = 'sicherung_liste') then 'ok' else 'FEHLT' end as probe;
