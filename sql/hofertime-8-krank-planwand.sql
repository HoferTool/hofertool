-- =================================================================
--  HOFERTIME 8: Krankheit nicht mehr auf der Planwand
--  Was es tut (Wunsch Patrick 19. November 2026: „krankheit soll nicht
--  mehr auf die planwand, ausser bei geplant, wie z.b operation“):
--  * Neue Spalte vacations.planwand (ja/nein, Vorgabe ja). Steht nein,
--    zeigt die Planwand den Eintrag nicht; HOFERTIME zählt ihn weiter.
--  * Wer in HOFERTIME „Abwesend …“ mit Krankheit einträgt, bekommt
--    planwand = nein, ausser er setzt das Häkchen „Geplant (z. B.
--    Operation)“. Krankheit, die auf der Planwand eingetragen wird,
--    gilt als geplant und bleibt sichtbar.
--  * zeit_abwesenheiten_liste liefert dazu Kennung und planwand, damit
--    HOFERTIME solche Einträge zeigen und löschen kann
--    (zeit_abwesenheit_loeschen: Admin von HOFERTIME oder die Person
--    selbst, nur Einträge, die nicht auf der Planwand stehen).
--  * Die bisherigen Krankheitstage aus HOFERTIME (vom 16. bis
--    18. November 2026) kommen von der Planwand weg.
--  Gefahrlos mehrfach ausführbar, ohne drop.
-- =================================================================

alter table public.vacations add column if not exists planwand boolean not null default true;

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
  v_plan := p_art <> 'krankheit' or coalesce(p_geplant, false);
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

-- Alte Fassung (4 Werte): Krankheit gilt als nicht geplant
create or replace function public.zeit_abwesend_eintragen(p_von date, p_tage int, p_art text, p_notiz text default null)
returns uuid language sql security definer set search_path = public as $$
  select public.zeit_abwesend_neu(p_von, p_tage, p_art, p_notiz, false);
$$;

create or replace function public.zeit_abwesenheiten_liste(p_person uuid, p_von date, p_bis date)
returns table(id uuid, person text, von date, tage integer, abwesenheit text, note text, planwand boolean)
language sql stable security definer set search_path to 'public' as $function$
  select v.id, v.person, v.von, v.tage, v.abwesenheit, v.note, v.planwand from public.vacations v, public.profiles p
  left join public.zeit_personen z on z.person_id = p.id
  where p.id = p_person
    and (p_person = auth.uid() or public.zeit_admin())
    and v.von <= p_bis and v.von + v.tage * 2 >= p_von
    and (lower(trim(v.person)) = lower(trim(p.full_name))
      or lower(trim(v.person)) = any (select lower(trim(x)) from unnest(coalesce(z.ferien_namen, '{}')) x));
$function$;

create or replace function public.zeit_abwesenheit_loeschen(p_person uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  if not (public.zeit_admin() or p_person = auth.uid()) then raise exception 'nicht erlaubt'; end if;
  if not exists (select 1 from public.zeit_abwesenheiten_liste(p_person, '1900-01-01', '2999-12-31') a
                 where a.id = p_id and not a.planwand) then
    raise exception 'nicht gefunden';
  end if;
  delete from public.vacations where id = p_id and not planwand;
end $$;

revoke all on function public.zeit_abwesend_eintragen(date, int, text, text) from public, anon;
grant execute on function public.zeit_abwesend_eintragen(date, int, text, text) to authenticated;
revoke all on function public.zeit_abwesend_neu(date, int, text, text, boolean) from public, anon;
grant execute on function public.zeit_abwesend_neu(date, int, text, text, boolean) to authenticated;
revoke all on function public.zeit_abwesenheiten_liste(uuid, date, date) from public, anon;
grant execute on function public.zeit_abwesenheiten_liste(uuid, date, date) to authenticated;
revoke all on function public.zeit_abwesenheit_loeschen(uuid, uuid) from public, anon;
grant execute on function public.zeit_abwesenheit_loeschen(uuid, uuid) to authenticated;

-- Bisherige Krankheit aus HOFERTIME weg von der Planwand
update public.vacations set planwand = false
 where abwesenheit = 'krankheit' and planwand and von between '2026-11-16' and '2026-11-18';

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns where table_name = 'vacations' and column_name = 'planwand')
  and exists (select 1 from pg_proc where proname = 'zeit_abwesend_neu')
  and exists (select 1 from pg_proc where proname = 'zeit_abwesenheiten_liste')
  and exists (select 1 from pg_proc where proname = 'zeit_abwesenheit_loeschen')
  then 'ok' else 'FEHLT' end as probe;
