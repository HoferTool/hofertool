-- =================================================================
--  HOFERTIME: Ferien und Gleitzeit selbst umbuchen (seit 1.650.0)
--  Wunsch Patrick 19. November 2026: „die benutzer sollen auch ferien
--  und gleitzeit umbuchen können, auch auf dem handy“.
--
--  Was die Datei tut:
--  - zeit_umbuchen: bucht für die angemeldete Person (oder, beim Admin
--    von HOFERTIME, für jede Person) Ferientage in Gleitzeit um oder
--    umgekehrt. Die Gleitzeit rechnet die Datenbank selbst aus der
--    Sollzeit im Profil (wie die App), damit niemand den Kurs ändert.
--  - zeit_umbuchung_loeschen: nimmt eine Umbuchung wieder weg, die
--    Person selbst nur ihre eigenen.
--  Nur für Monatslöhner mit Sollzeit. Gefahrlos mehrfach ausführbar.
-- =================================================================

create or replace function public.zeit_umbuchen(p_person uuid, p_datum date, p_tage numeric, p_notiz text)
returns public.zeit_buchungen
language plpgsql security definer set search_path = public as $$
declare
  e public.zeit_personen;
  v_pro numeric;
  v_werte numeric[];
  r public.zeit_buchungen;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  if not (public.zeit_admin() or p_person = auth.uid()) then raise exception 'nicht erlaubt'; end if;
  if p_tage is null or p_tage = 0 or abs(p_tage) > 60 then raise exception 'Tage ungültig'; end if;
  if p_datum is null then p_datum := current_date; end if;
  select * into e from public.zeit_personen where person_id = p_person;
  if not found or coalesce(e.lohnart, 'monat') = 'stunde' then raise exception 'nur für Monatslohn'; end if;
  -- Minuten je Ferientag wie minutenJeFerientag in src/daten/zeit.js
  if e.soll_tage is not null and e.soll_tage <> '{}'::jsonb then
    select array_agg(v::numeric) into v_werte
      from jsonb_each_text(e.soll_tage) as t(k, v) where v ~ '^[0-9.]+$' and v::numeric > 0;
    v_pro := case when v_werte is null then 0
      else round((select avg(x) from unnest(v_werte) x) * 60) end;
  else
    v_pro := round(coalesce(e.soll_woche_h, 0) * coalesce(e.pensum, 0) / 100 / 5 * 60);
  end if;
  if coalesce(v_pro, 0) <= 0 then raise exception 'Sollzeit fehlt im Profil'; end if;
  insert into public.zeit_buchungen (person_id, datum, tage, minuten, notiz, erstellt_von)
    values (p_person, p_datum, p_tage, round(-p_tage * v_pro)::int, nullif(trim(coalesce(p_notiz, '')), ''), auth.uid())
    returning * into r;
  return r;
end $$;
revoke all on function public.zeit_umbuchen(uuid, date, numeric, text) from public, anon;
grant execute on function public.zeit_umbuchen(uuid, date, numeric, text) to authenticated;

create or replace function public.zeit_umbuchung_loeschen(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_person uuid;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  select person_id into v_person from public.zeit_buchungen where id = p_id;
  if v_person is null then return false; end if;
  if not (public.zeit_admin() or v_person = auth.uid()) then raise exception 'nicht erlaubt'; end if;
  delete from public.zeit_buchungen where id = p_id;
  return true;
end $$;
revoke all on function public.zeit_umbuchung_loeschen(uuid) from public, anon;
grant execute on function public.zeit_umbuchung_loeschen(uuid) to authenticated;

notify pgrst, 'reload schema';

select case when to_regprocedure('public.zeit_umbuchen(uuid,date,numeric,text)') is not null
  and to_regprocedure('public.zeit_umbuchung_loeschen(uuid)') is not null
  then 'ok' else 'FEHLT' end as probe;
