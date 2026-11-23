-- =================================================================
--  HOFERTIME 17: Schule nicht auf der Planwand
--  Was es tut (Wunsch Patrick 23. November 2026: „Planwand eintrag
--  brauchts dort speziell nicht bei schule“): Abwesenheiten mit Art
--  Schule kommen nicht mehr auf die Planwand (planwand = false), wie
--  ungeplante Krankheit; HOFERTIME zählt sie weiter. Gilt beim
--  Eintragen (zeit_abwesend_neu) und Ändern (zeit_abwesenheit_aendern).
--  Bestehende Schule-Einträge werden ebenfalls von der Planwand genommen.
--  Gefahrlos mehrfach ausführbar, ohne drop.
-- =================================================================

create or replace function public.zeit_abwesend_neu(p_von date, p_tage int, p_art text, p_notiz text, p_geplant boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_rolle text;
  v_ende date;
  v_zeile int;
  v_id uuid;
  v_plan boolean;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  select role, full_name into v_rolle, v_name from profiles where id = auth.uid();
  if v_rolle is null or v_rolle in ('extern', 'dienst') then raise exception 'nicht erlaubt'; end if;
  if p_art not in ('ferien','kompensieren','militaer','feuerwehr','schule','krankheit','unfall') then
    raise exception 'unbekannte Art';
  end if;
  if p_von is null or p_tage is null or p_tage < 1 or p_tage > 60 then raise exception 'Tage 1 bis 60'; end if;
  v_plan := p_art <> 'schule' and (p_art <> 'krankheit' or coalesce(p_geplant, false));
  select coalesce((select ferien_namen[1] from zeit_personen where person_id = auth.uid() and ferien_namen[1] <> ''), v_name)
    into v_name;
  if coalesce(v_name, '') = '' then raise exception 'kein Name'; end if;
  v_ende := p_von + (p_tage - 1 + 2 * ((p_tage + 4) / 5));
  -- Nicht auf der Planwand: keine Zeile belegen
  if v_plan then
    select min(z) into v_zeile from generate_series(1, 60) z
     where not exists (select 1 from vacations f
       where coalesce(f.zeile, 1) = z and f.planwand
         and f.von <= v_ende
         and f.von + (coalesce(f.tage,1) - 1 + 2 * ((coalesce(f.tage,1) + 4) / 5)) >= p_von);
  end if;
  insert into vacations (person, von, tage, zeile, note, abwesenheit, genehmigt, created_by, planwand)
  values (v_name, p_von, p_tage, coalesce(v_zeile, 1), nullif(trim(coalesce(p_notiz, '')), ''), p_art, true, auth.uid(), v_plan)
  returning id into v_id;
  return v_id;
end $$;

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
  v_plan := p_art <> 'schule' and (p_art <> 'krankheit' or coalesce(p_geplant, false));
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

update public.vacations set planwand = false where abwesenheit = 'schule' and planwand;

notify pgrst, 'reload schema';

select case when position('p_art <> ''schule''' in pg_get_functiondef('public.zeit_abwesend_neu(date,int,text,text,boolean)'::regprocedure)) > 0
  and not exists (select 1 from public.vacations where abwesenheit = 'schule' and planwand)
  then 'ok' else 'FEHLT' end as probe;
