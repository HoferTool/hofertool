-- =================================================================
--  HOFERTIME, Teil 2 (seit 1.626.0, Wünsche Patrick 18. November 2026)
--  Im Supabase SQL Editor einmal ganz ausführen. Gefahrlos mehrfach.
--
--  1. Stempel-Panel am iPad: „an den Panels ohne Anmeldung Person wählen
--     können und stempeln“. Ein Panel-Konto (profiles.zeit_terminal) darf
--     nur Namen und Stand sehen, stempeln und die eigene Stempelung bis
--     2 Minuten danach zurücknehmen.
--  2. Saldo am Panel ohne Stempeln (zeit_panel_saldo): nur die Daten der
--     gewählten Person, die App rechnet Gleitzeit und Ferien daraus.
--  3. Bezahlte Feiertage (zeit_feiertage), im Voraus oder nachträglich:
--     wer an dem Tag nicht stempelt, gilt als bezahlt abwesend.
--  4. Personenprofil: Sollzeit je Wochentag (soll_tage), Geburtstag,
--     Ferien automatisch nach Alter und Pensum (ferien_auto) mit den
--     Stufen in zeit_ferienstufen.
--  5. Umbuchen Ferien ↔ Gleitzeit (zeit_buchungen), nur Admins.
--  6. Neue Abwesenheiten auf der Planwand: Schule, Krankheit, Unfall.
--  7. Eintritt je Person für die Dienstjubiläen alle 5 Jahre und die
--     Ferienstufen laut Personalreglement (24 / 25 / 27 Tage).
-- =================================================================

alter table public.profiles add column if not exists zeit_terminal boolean not null default false;

create or replace function public.profil_zeit_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.bin_admin()
     and (new.nur_zeit is distinct from old.nur_zeit or new.zeit_terminal is distinct from old.zeit_terminal) then
    raise exception 'Nur ein Administrator darf das ändern';
  end if;
  return new;
end $$;

create or replace function public.ist_zeit_panel() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and coalesce(p.is_active, true) and coalesce(p.zeit_terminal, false));
$$;

-- Wer am Panel stempeln darf: aktive Personen ausser Externen, Dienst und Gerätekonten
create or replace function public.zeit_panel_person_ok(p_person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_person
    and coalesce(p.is_active, true) and p.role not in ('extern', 'dienst')
    and not coalesce(p.andere_nutzer, false));
$$;

create or replace function public.zeit_panel_personen()
returns table (id uuid, full_name text, bild_url text, da boolean, seit timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, null::text,
    coalesce(l.art = 'kommen' and l.zeit > now() - interval '16 hours', false),
    case when l.art = 'kommen' then l.zeit end
  from public.profiles p
  left join lateral (select s.art, s.zeit from public.zeit_stempel s
    where s.person_id = p.id and s.zeit <= now() order by s.zeit desc limit 1) l on true
  where public.ist_zeit_panel()
    and coalesce(p.is_active, true) and p.role not in ('extern', 'dienst')
    and not coalesce(p.andere_nutzer, false)
  order by p.full_name;
$$;

create or replace function public.zeit_panel_stempeln(p_person uuid, p_art text)
returns public.zeit_stempel
language plpgsql security definer set search_path = public as $$
declare r public.zeit_stempel;
begin
  if not public.ist_zeit_panel() then raise exception 'Nur am Stempel-Panel'; end if;
  if not public.zeit_panel_person_ok(p_person) then raise exception 'Diese Person erfasst keine Zeiten'; end if;
  if p_art not in ('kommen', 'gehen') then raise exception 'Kommen oder Gehen'; end if;
  insert into public.zeit_stempel (person_id, art, zeit, quelle, geraet, erstellt_von)
    values (p_person, p_art, now(), 'terminal', (select full_name from public.profiles where id = auth.uid()), auth.uid())
    returning * into r;
  return r;
end $$;

create or replace function public.zeit_panel_zurueck(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.ist_zeit_panel() then return false; end if;
  delete from public.zeit_stempel where id = p_id and erstellt_von = auth.uid()
    and erstellt_am > now() - interval '2 minutes';
  get diagnostics n = row_count;
  return n > 0;
end $$;

grant execute on function public.zeit_panel_personen() to authenticated;
grant execute on function public.zeit_panel_stempeln(uuid, text) to authenticated;
grant execute on function public.zeit_panel_zurueck(uuid) to authenticated;


alter table public.zeit_personen add column if not exists soll_tage jsonb;
alter table public.zeit_personen add column if not exists geburtstag date;
alter table public.zeit_personen add column if not exists ferien_auto boolean not null default true;
-- Eintritt für die Dienstjubiläen alle 5 Jahre (Wunsch Patrick 18. November 2026)
alter table public.zeit_personen add column if not exists eintritt date;
-- Abteilung für Auswertungen, im Profil zugewiesen (Wunsch Patrick 18. November 2026)
alter table public.zeit_personen add column if not exists abteilung text;

create table if not exists public.zeit_ferienstufen (
  ab_alter int primary key,
  tage numeric not null
);
alter table public.zeit_ferienstufen enable row level security;

-- Stufen laut Personalreglement (Foto Patrick 18. November 2026), Tage bei 100 %:
-- bis 20 Jahre 25 Tage (gesetzlich 5 Wochen), ab dem 20. Altersjahr 24,
-- ab dem 40. 25, ab dem 50. 27. Vorhandene Stufen bleiben, wie sie sind.
insert into public.zeit_ferienstufen (ab_alter, tage) values (0, 25), (20, 24), (40, 25), (50, 27)
  on conflict (ab_alter) do nothing;

create table if not exists public.zeit_buchungen (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles(id) on delete cascade,
  datum date not null default current_date,
  tage numeric not null default 0,       -- + = Ferientage dazu
  minuten int not null default 0,        -- + = Gleitzeit dazu
  notiz text,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
create index if not exists zeit_buchungen_person on public.zeit_buchungen (person_id, datum);
alter table public.zeit_buchungen enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'zeit_ferienstufen' and policyname = 'zeit stufen lesen') then
    create policy "zeit stufen lesen" on public.zeit_ferienstufen for select to authenticated
      using ((select bin_admin()) or (select zeit_darf()) or (select ist_zeit_panel()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'zeit_ferienstufen' and policyname = 'zeit stufen admin') then
    create policy "zeit stufen admin" on public.zeit_ferienstufen for all to authenticated
      using ((select bin_admin())) with check ((select bin_admin()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'zeit_buchungen' and policyname = 'zeit buchungen lesen') then
    create policy "zeit buchungen lesen" on public.zeit_buchungen for select to authenticated
      using ((select bin_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'zeit_buchungen' and policyname = 'zeit buchungen admin') then
    create policy "zeit buchungen admin" on public.zeit_buchungen for all to authenticated
      using ((select bin_admin())) with check ((select bin_admin()));
  end if;
end $$;

-- Neue Arten der Abwesenheit (die Regel wird ersetzt, damit sie die neuen kennt)
alter table public.vacations drop constraint if exists vacations_abwesenheit_check;
alter table public.vacations add constraint vacations_abwesenheit_check
  check (abwesenheit in ('ferien', 'kompensieren', 'militaer', 'feuerwehr', 'schule', 'krankheit', 'unfall'));

create table if not exists public.zeit_feiertage (
  datum date primary key,
  name text not null default 'Feiertag',
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
alter table public.zeit_feiertage enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'zeit_feiertage' and policyname = 'zeit feiertage lesen') then
    create policy "zeit feiertage lesen" on public.zeit_feiertage for select to authenticated
      using ((select bin_admin()) or (select zeit_darf()) or (select ist_zeit_panel()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'zeit_feiertage' and policyname = 'zeit feiertage admin') then
    create policy "zeit feiertage admin" on public.zeit_feiertage for all to authenticated
      using ((select bin_admin())) with check ((select bin_admin()));
  end if;
end $$;


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
    'stempel', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'art', s.art, 'zeit', s.zeit) order by s.zeit)
      from public.zeit_stempel s where s.person_id = p_person and s.zeit >= ab::timestamptz and s.zeit <= now() + interval '1 day'), '[]'::jsonb),
    'ferien', coalesce((select jsonb_agg(jsonb_build_object('person', v.person, 'von', v.von, 'tage', v.tage, 'abwesenheit', v.abwesenheit))
      from public.vacations v, public.profiles p
      where p.id = p_person and v.von <= jahr_ende and v.von + v.tage * 2 >= fab
        and (lower(trim(v.person)) = lower(trim(p.full_name))
          or lower(trim(v.person)) = any (select lower(trim(x)) from unnest(coalesce(e.ferien_namen, '{}')) x))), '[]'::jsonb),
    'buchungen', coalesce((select jsonb_agg(to_jsonb(b) order by b.datum) from public.zeit_buchungen b where b.person_id = p_person), '[]'::jsonb),
    'stufen', coalesce((select jsonb_agg(to_jsonb(f) order by f.ab_alter) from public.zeit_ferienstufen f), '[]'::jsonb));
end $$;


grant execute on function public.zeit_panel_saldo(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Probe: zeigt ok oder FEHLT
select case when exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'zeit_terminal')
  and exists (select 1 from information_schema.columns where table_name = 'zeit_personen' and column_name = 'ferien_auto')
  and exists (select 1 from information_schema.columns where table_name = 'zeit_personen' and column_name = 'eintritt')
  and exists (select 1 from information_schema.columns where table_name = 'zeit_personen' and column_name = 'abteilung')
  and to_regclass('public.zeit_feiertage') is not null
  and to_regclass('public.zeit_buchungen') is not null
  and to_regclass('public.zeit_ferienstufen') is not null
  and to_regprocedure('public.zeit_panel_saldo(uuid)') is not null
  and to_regprocedure('public.zeit_panel_stempeln(uuid,text)') is not null then 'ok' else 'FEHLT' end as probe;
