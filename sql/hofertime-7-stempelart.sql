-- =================================================================
--  HOFERTIME: Stempelart je Stempelung (seit 1.640.0, Wunsch Patrick
--  19. November 2026: „Stempelfunktion für anwesend von bis … dort soll
--  auch die Stempelart eingetragen werden können“, „Rest vom Tag mit
--  krank etc. ausfüllen bis auf Sollzeit“).
--
--  Was diese Datei tut:
--  - Neue Spalte zeit_stempel.stempelart. Leer heisst wie bisher Arbeit.
--    Sonst krankheit, unfall, arzt, militaer, feuerwehr, schule oder
--    kompensieren. Die Art steht beim Kommen und beim Gehen des Paars.
--  - Das Stempel-Panel bekommt die Art mit, damit es den Saldo gleich
--    rechnet wie die App (Kompensieren zählt nicht als Zeit).
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

alter table public.zeit_stempel add column if not exists stempelart text;

create or replace function public.zeit_panel_saldo(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.zeit_personen; ab date; fab date; jahr_ende date;
begin
  if not public.ist_zeit_panel() or not public.zeit_panel_person_ok(p_person) then return null; end if;
  select * into e from public.zeit_personen where person_id = p_person;
  ab := coalesce(e.saldo_start_tag, make_date(extract(year from now())::int, 1, 1));
  fab := least(ab - 30, make_date(coalesce(e.ferien_jahr, extract(year from now())::int), 1, 1));
  jahr_ende := make_date(extract(year from now())::int, 12, 31);
  return jsonb_build_object(
    'einst', to_jsonb(e),
    'stempel', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'art', s.art, 'zeit', s.zeit, 'stempelart', s.stempelart) order by s.zeit)
      from public.zeit_stempel s where s.person_id = p_person and s.zeit >= ab::timestamptz and s.zeit <= now() + interval '1 day'), '[]'::jsonb),
    'ferien', coalesce((select jsonb_agg(jsonb_build_object('person', v.person, 'von', v.von, 'tage', v.tage, 'abwesenheit', v.abwesenheit))
      from public.vacations v, public.profiles p
      where p.id = p_person and v.von <= jahr_ende and v.von + v.tage * 2 >= fab
        and (lower(trim(v.person)) = lower(trim(p.full_name))
          or lower(trim(v.person)) = any (select lower(trim(x)) from unnest(coalesce(e.ferien_namen, '{}')) x))), '[]'::jsonb),
    'buchungen', coalesce((select jsonb_agg(to_jsonb(b) order by b.datum) from public.zeit_buchungen b where b.person_id = p_person), '[]'::jsonb),
    'stufen', coalesce((select jsonb_agg(to_jsonb(f) order by f.ab_alter) from public.zeit_ferienstufen f), '[]'::jsonb));
end $$;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'zeit_stempel' and column_name = 'stempelart') then 'ok' else 'FEHLT' end as probe;
