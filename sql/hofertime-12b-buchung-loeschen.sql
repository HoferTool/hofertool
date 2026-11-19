-- =================================================================
-- HOFERTIME: Teil 2 zu hofertime-12-buchungsarten.sql
-- Die Person selbst löscht nur noch ihre Umbuchungen (art leer), nicht
-- Auszahlungen und Korrekturen; die löscht nur der Admin von HOFERTIME.
-- Gefahrlos mehrfach ausführbar.
-- =================================================================

create or replace function public.zeit_umbuchung_loeschen(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_person uuid; v_art text;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  select person_id, art into v_person, v_art from public.zeit_buchungen where id = p_id;
  if v_person is null then return false; end if;
  if not (public.zeit_admin() or (v_person = auth.uid() and v_art is null)) then raise exception 'nicht erlaubt'; end if;
  delete from public.zeit_buchungen where id = p_id;
  return true;
end $$;
revoke all on function public.zeit_umbuchung_loeschen(uuid) from public, anon;
grant execute on function public.zeit_umbuchung_loeschen(uuid) to authenticated;

notify pgrst, 'reload schema';

select case when position('v_art is null' in pg_get_functiondef('public.zeit_umbuchung_loeschen(uuid)'::regprocedure)) > 0
  then 'ok' else 'FEHLT' end as probe;
