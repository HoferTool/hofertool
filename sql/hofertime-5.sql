-- HOFERTIME: Admin nur noch, wer in der Tabelle zeit_admins steht
-- (Wunsch Patrick 18. November 2026: „nur ich darf admin rechte haben“,
-- Entscheid „Nur in HOFERTIME“).
--
-- Was die Datei tut:
-- * neue Tabelle zeit_admins: wer darin steht, ist Admin in HOFERTIME.
--   Niemand kann sie über die App ändern (keine Regel zum Schreiben),
--   auch kein Admin des HoferTools, nur der SQL Editor.
-- * neue Funktion zeit_admin(): steht in zeit_admins und ist aktiv.
-- * alle Regeln der Tabellen zeit_… nehmen zeit_admin() statt bin_admin().
--   Andere Admins sehen in HOFERTIME nur noch ihre eigenen Zeiten.
-- * zeit_abwesenheiten und der Schutz für nur_zeit / zeit_terminal ebenso.
-- * Im übrigen HoferTool bleibt alles, wie es ist.
-- Wer drinsteht, trägt man per SQL ein (nicht in dieser Datei, keine Namen hier):
--   insert into zeit_admins (person_id) values ('<Kennung>') on conflict do nothing;
-- Gefahrlos mehrfach ausführbar, ohne drop.

create table if not exists public.zeit_admins (
  person_id uuid primary key references public.profiles(id) on delete cascade,
  seit timestamptz not null default now()
);
alter table public.zeit_admins enable row level security;
revoke all on public.zeit_admins from anon, authenticated;

create or replace function public.zeit_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.zeit_admins a join public.profiles p on p.id = a.person_id
    where a.person_id = auth.uid() and coalesce(p.is_active, true));
$$;
revoke all on function public.zeit_admin() from public, anon;
grant execute on function public.zeit_admin() to authenticated;

alter policy "zeit buchungen admin" on public.zeit_buchungen
  using ((select zeit_admin())) with check ((select zeit_admin()));
alter policy "zeit buchungen lesen" on public.zeit_buchungen
  using ((select zeit_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
alter policy "zeit feiertage admin" on public.zeit_feiertage
  using ((select zeit_admin())) with check ((select zeit_admin()));
alter policy "zeit feiertage lesen" on public.zeit_feiertage
  using ((select zeit_admin()) or (select zeit_darf()) or (select ist_zeit_panel()));
alter policy "zeit stufen admin" on public.zeit_ferienstufen
  using ((select zeit_admin())) with check ((select zeit_admin()));
alter policy "zeit stufen lesen" on public.zeit_ferienstufen
  using ((select zeit_admin()) or (select zeit_darf()) or (select ist_zeit_panel()));
alter policy "zeitpersonen admin" on public.zeit_personen
  using ((select zeit_admin())) with check ((select zeit_admin()));
alter policy "zeitpersonen lesen" on public.zeit_personen
  using ((select zeit_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
alter policy "zeit eigene oder admin aendern" on public.zeit_stempel
  using ((select zeit_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())))
  with check ((select zeit_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
alter policy "zeit eigene oder admin anlegen" on public.zeit_stempel
  with check ((select zeit_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
alter policy "zeit eigene oder admin lesen" on public.zeit_stempel
  using ((select zeit_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
alter policy "zeit eigene oder admin loeschen" on public.zeit_stempel
  using ((select zeit_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
alter policy "zeitverlauf eigene oder admin" on public.zeit_verlauf
  using ((select zeit_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));

create or replace function public.zeit_abwesenheiten(p_person uuid, p_von date, p_bis date)
returns table(person text, von date, tage integer, abwesenheit text)
language sql stable security definer set search_path to 'public' as $function$
  select v.person, v.von, v.tage, v.abwesenheit from public.vacations v, public.profiles p
  left join public.zeit_personen z on z.person_id = p.id
  where p.id = p_person
    and (p_person = auth.uid() or public.zeit_admin())
    and v.von <= p_bis and v.von + v.tage * 2 >= p_von
    and (lower(trim(v.person)) = lower(trim(p.full_name))
      or lower(trim(v.person)) = any (select lower(trim(x)) from unnest(coalesce(z.ferien_namen, '{}')) x));
$function$;

create or replace function public.profil_zeit_schutz() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is not null and not public.zeit_admin()
     and (new.nur_zeit is distinct from old.nur_zeit or new.zeit_terminal is distinct from old.zeit_terminal) then
    raise exception 'Nur der Administrator von HOFERTIME darf das ändern';
  end if;
  return new;
end $function$;

notify pgrst, 'reload schema';

-- Probe: zeigt ok, wenn alle Regeln zeit_admin nehmen und mindestens eine Person drinsteht
select case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'zeit%'
    and (coalesce(qual, '') || coalesce(with_check, '')) like '%bin_admin%')
  and exists (select 1 from zeit_admins)
  then 'ok' else 'FEHLT' end as probe;
