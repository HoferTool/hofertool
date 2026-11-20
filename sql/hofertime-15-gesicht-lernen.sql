-- =================================================================
--  HOFERTIME: Gesichtserkennung lernt am Stempel-Panel dazu
--  (seit 1.658.0, Patrick 20. November 2026: „die Gesichtserkennung
--  auf dem iPad funktioniert schlecht. Kannst du das optimieren?“)
--
--  Was die Datei tut:
--  - Neue Spalte zeit_gesichter.gelernt: Zahlenmuster (kein Foto), die
--    das Panel selbst aufnimmt, wenn es eine Person sicher erkannt hat
--    und sie stempelt. So kennt es das Gesicht auch mit dem Licht und
--    Blickwinkel des iPads. Es bleiben höchstens die letzten 8.
--  - zeit_panel_gesicht_lernen: nur das Panel-Konto, nur Personen, die
--    dort stempeln dürfen. zeit_panel_gesicht_verlernen nimmt das
--    zuletzt Gelernte wieder weg („Rückgängig, falsche Person“).
--  - zeit_panel_gesichter gibt die eingelernten und gelernten Muster
--    zusammen. Neu einlernen (zeit_gesicht_setzen) leert das Gelernte.
--  Gefahrlos mehrfach ausführbar. Am Schluss eine Probe mit ok / FEHLT.
-- =================================================================

alter table public.zeit_gesichter add column if not exists gelernt jsonb not null default '[]'::jsonb;

create or replace function public.zeit_panel_gesicht_lernen(p_person uuid, p_muster jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.ist_zeit_panel() or not public.zeit_panel_person_ok(p_person) then return false; end if;
  if jsonb_typeof(p_muster) <> 'array' or jsonb_array_length(p_muster) <> 128 then return false; end if;
  update public.zeit_gesichter g
    set gelernt = (select coalesce(jsonb_agg(x order by i), '[]'::jsonb) from (
        select x, i from jsonb_array_elements(g.gelernt || jsonb_build_array(p_muster)) with ordinality t(x, i)
        order by i desc limit 8) s)
    where g.person_id = p_person;
  return found;
end $$;

create or replace function public.zeit_panel_gesicht_verlernen(p_person uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.ist_zeit_panel() or not public.zeit_panel_person_ok(p_person) then return false; end if;
  update public.zeit_gesichter set gelernt = gelernt - (jsonb_array_length(gelernt) - 1)
    where person_id = p_person and jsonb_array_length(gelernt) > 0;
  return found;
end $$;

create or replace function public.zeit_panel_gesichter()
returns table (person_id uuid, muster jsonb)
language sql stable security definer set search_path = public as $$
  select g.person_id, g.muster || coalesce(g.gelernt, '[]'::jsonb) from public.zeit_gesichter g
  where public.ist_zeit_panel() and public.zeit_panel_person_ok(g.person_id);
$$;

create or replace function public.zeit_gesicht_setzen(p_person uuid, p_muster jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare rolle text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not (public.zeit_admin() or p_person = auth.uid()) then
    raise exception 'Nur die Person selbst oder der Admin von HOFERTIME';
  end if;
  select role into rolle from public.profiles where id = p_person;
  if rolle is null or rolle in ('extern', 'dienst') then raise exception 'Diese Person erfasst keine Zeiten'; end if;
  if jsonb_typeof(p_muster) <> 'array' or jsonb_array_length(p_muster) not between 1 and 10 then
    raise exception 'Muster ungültig';
  end if;
  insert into public.zeit_gesichter (person_id, muster, einverstanden_am, erstellt_am, erstellt_von, gelernt)
    values (p_person, p_muster, now(), now(), auth.uid(), '[]'::jsonb)
    on conflict (person_id) do update set muster = excluded.muster,
      einverstanden_am = excluded.einverstanden_am, erstellt_am = excluded.erstellt_am,
      erstellt_von = excluded.erstellt_von, gelernt = '[]'::jsonb;
  return true;
end $$;

revoke all on function public.zeit_panel_gesicht_lernen(uuid, jsonb) from public, anon;
revoke all on function public.zeit_panel_gesicht_verlernen(uuid) from public, anon;
grant execute on function public.zeit_panel_gesicht_lernen(uuid, jsonb) to authenticated;
grant execute on function public.zeit_panel_gesicht_verlernen(uuid) to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns where table_name = 'zeit_gesichter' and column_name = 'gelernt')
  and exists (select 1 from pg_proc where proname = 'zeit_panel_gesicht_lernen')
  and exists (select 1 from pg_proc where proname = 'zeit_panel_gesicht_verlernen')
  then 'ok' else 'FEHLT' end as probe;
