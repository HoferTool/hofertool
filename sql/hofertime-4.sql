-- =================================================================
--  HOFERTIME 4: Abwesenheit selbst eintragen
--  Was es tut: Jede Person darf in HOFERTIME für sich selbst eine
--  Abwesenheit (Krankheit, Unfall, Schule, Kompensieren …) eintragen,
--  auch wer nur ein HOFERTIME-Konto hat und die Planwand nicht sieht.
--  Der Eintrag kommt wie bisher in die Ferienzeile der Planwand
--  (Tabelle vacations), mit dem Namen der Person. Nur für sich selbst,
--  nie für andere; Externe und Dienst nicht. Ändern und löschen
--  weiter auf der Planwand bzw. durch einen Admin.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

create or replace function public.zeit_abwesend_eintragen(p_von date, p_tage int, p_art text, p_notiz text default null)
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
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  select role, full_name into v_rolle, v_name from profiles where id = auth.uid();
  if v_rolle is null or v_rolle in ('extern', 'dienst') then raise exception 'nicht erlaubt'; end if;
  if p_art not in ('ferien','kompensieren','militaer','feuerwehr','schule','krankheit','unfall') then
    raise exception 'unbekannte Art';
  end if;
  if p_von is null or p_tage is null or p_tage < 1 or p_tage > 60 then raise exception 'Tage 1 bis 60'; end if;
  select coalesce((select ferien_namen[1] from zeit_personen where person_id = auth.uid() and ferien_namen[1] <> ''), v_name)
    into v_name;
  if coalesce(v_name, '') = '' then raise exception 'kein Name'; end if;
  -- Kalenderende grob mit Wochenenden, reicht zum Finden einer freien Zeile
  v_ende := p_von + (p_tage - 1 + 2 * ((p_tage + 4) / 5));
  select min(z) into v_zeile from generate_series(1, 60) z
   where not exists (select 1 from vacations f
     where coalesce(f.zeile, 1) = z
       and f.von <= v_ende
       and f.von + (coalesce(f.tage,1) - 1 + 2 * ((coalesce(f.tage,1) + 4) / 5)) >= p_von);
  insert into vacations (person, von, tage, zeile, note, abwesenheit, genehmigt, created_by)
  values (v_name, p_von, p_tage, coalesce(v_zeile, 1), nullif(trim(coalesce(p_notiz, '')), ''), p_art, true, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.zeit_abwesend_eintragen(date, int, text, text) from public, anon;
grant execute on function public.zeit_abwesend_eintragen(date, int, text, text) to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'zeit_abwesend_eintragen') then 'ok' else 'FEHLT' end as probe;
