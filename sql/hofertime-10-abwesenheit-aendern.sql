-- =================================================================
--  HOFERTIME 10: Eingetragene Abwesenheiten ändern und löschen
--  Was es tut (Wunsch Patrick 19. November 2026: „eingetragene
--  abwesenheiten müssen geändert werden können, auch nachträglich“):
--  * zeit_abwesenheit_aendern: Art, erster Tag, Anzahl Tage, Notiz und
--    „Krankheit geplant“ eines Eintrags ändern, auch rückwirkend.
--    Darf der Admin von HOFERTIME und die Person selbst, nur Einträge,
--    die zu dieser Person gehören (wie zeit_abwesenheiten_liste).
--    Ändert sich der Zeitraum eines Eintrags auf der Planwand, sucht die
--    Funktion eine freie Ferienzeile, wenn die bisherige belegt ist.
--  * zeit_abwesenheit_loeschen: löscht jetzt auch Einträge, die auf der
--    Planwand stehen (vorher nur ungeplante Krankheit).
--  Gefahrlos mehrfach ausführbar, ohne drop.
-- =================================================================

create or replace function public.zeit_abwesenheit_aendern(p_person uuid, p_id uuid, p_von date, p_tage int, p_art text, p_notiz text, p_geplant boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan boolean;
  v_zeile int;
  v_ende date;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  if not (public.zeit_admin() or p_person = auth.uid()) then raise exception 'nicht erlaubt'; end if;
  if p_art not in ('ferien','kompensieren','militaer','feuerwehr','schule','krankheit','unfall') then
    raise exception 'unbekannte Art';
  end if;
  if p_von is null or p_tage is null or p_tage < 1 or p_tage > 260 then raise exception 'Tage 1 bis 260'; end if;
  if not exists (select 1 from public.zeit_abwesenheiten_liste(p_person, '1900-01-01', '2999-12-31') a where a.id = p_id) then
    raise exception 'nicht gefunden';
  end if;
  v_plan := p_art <> 'krankheit' or coalesce(p_geplant, false);
  select coalesce(zeile, 1) into v_zeile from vacations where id = p_id;
  v_ende := p_von + (p_tage - 1 + 2 * ((p_tage + 4) / 5));
  if v_plan and exists (select 1 from vacations f
       where f.id <> p_id and coalesce(f.zeile, 1) = v_zeile and f.planwand
         and f.von <= v_ende
         and f.von + (coalesce(f.tage,1) - 1 + 2 * ((coalesce(f.tage,1) + 4) / 5)) >= p_von) then
    select min(z) into v_zeile from generate_series(1, 60) z
     where not exists (select 1 from vacations f
       where f.id <> p_id and coalesce(f.zeile, 1) = z and f.planwand
         and f.von <= v_ende
         and f.von + (coalesce(f.tage,1) - 1 + 2 * ((coalesce(f.tage,1) + 4) / 5)) >= p_von);
  end if;
  update vacations set von = p_von, tage = p_tage, abwesenheit = p_art,
         note = nullif(trim(coalesce(p_notiz, '')), ''), planwand = v_plan, zeile = coalesce(v_zeile, 1)
   where id = p_id;
end $$;

create or replace function public.zeit_abwesenheit_loeschen(p_person uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  if not (public.zeit_admin() or p_person = auth.uid()) then raise exception 'nicht erlaubt'; end if;
  if not exists (select 1 from public.zeit_abwesenheiten_liste(p_person, '1900-01-01', '2999-12-31') a where a.id = p_id) then
    raise exception 'nicht gefunden';
  end if;
  delete from public.vacations where id = p_id;
end $$;

revoke all on function public.zeit_abwesenheit_aendern(uuid, uuid, date, int, text, text, boolean) from public, anon;
grant execute on function public.zeit_abwesenheit_aendern(uuid, uuid, date, int, text, text, boolean) to authenticated;
revoke all on function public.zeit_abwesenheit_loeschen(uuid, uuid) from public, anon;
grant execute on function public.zeit_abwesenheit_loeschen(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'zeit_abwesenheit_aendern')
  and exists (select 1 from pg_proc where proname = 'zeit_abwesenheit_loeschen')
  then 'ok' else 'FEHLT' end as probe;
