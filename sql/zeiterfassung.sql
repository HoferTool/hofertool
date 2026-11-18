-- =================================================================
--  ZEITERFASSUNG (seit 1.626.0, Wunsch Patrick 18. November 2026:
--  „Zeiterfassungstool für die Mitarbeiter … an iPads in der Firma
--  anmelden und abmelden, auf den Handys und am PC auch“, „jeder
--  Mitarbeiter soll seine Zeiten sehen und managen können“)
--  zeit_stempel: jede Stempelung eine Zeile (kommen / gehen). Die App
--  rechnet daraus Paare und Summen je Tag, Woche, Monat.
--  Jede Person sieht und ändert nur ihre eigenen, Admins alle.
--  Externe, Dienstkonto und Gerätekonten („Andere Nutzer“) nicht.
--  zeit_verlauf: schreibt die Datenbank selbst bei jedem Anlegen,
--  Ändern und Löschen (vorher / nachher, wer, wann), damit nachvollziehbar
--  bleibt, was jemand an seinen Zeiten geändert hat.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
create table if not exists public.zeit_stempel (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  art text not null check (art in ('kommen', 'gehen')),
  zeit timestamptz not null default now(),
  quelle text,            -- handy, pc, terminal, nachgetragen, import
  geraet text,
  notiz text,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz,
  geaendert_von uuid
);
create index if not exists zeit_stempel_person_zeit on public.zeit_stempel (person_id, zeit);

create table if not exists public.zeit_verlauf (
  id bigint generated always as identity primary key,
  stempel_id uuid,
  person_id uuid,
  was text not null,      -- neu, geaendert, geloescht
  vorher jsonb,
  nachher jsonb,
  wer uuid default auth.uid(),
  wann timestamptz not null default now()
);
create index if not exists zeit_verlauf_person on public.zeit_verlauf (person_id, wann desc);

-- Wer überhaupt Zeiten erfasst: alle Personen ausser Externen, Dienst und Gerätekonten
create or replace function public.zeit_darf() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid()
    and coalesce(p.is_active, true) and p.role not in ('extern', 'dienst')
    and not coalesce(p.andere_nutzer, false));
$$;

create or replace function public.zeit_stempel_merken() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.geaendert_am := now();
    new.geaendert_von := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists zeit_stempel_merken on public.zeit_stempel;
create trigger zeit_stempel_merken before update on public.zeit_stempel
  for each row execute function public.zeit_stempel_merken();

create or replace function public.zeit_stempel_verlauf() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.zeit_verlauf (stempel_id, person_id, was, nachher)
      values (new.id, new.person_id, 'neu', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.zeit_verlauf (stempel_id, person_id, was, vorher, nachher)
      values (new.id, new.person_id, 'geaendert', to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.zeit_verlauf (stempel_id, person_id, was, vorher)
      values (old.id, old.person_id, 'geloescht', to_jsonb(old));
    return old;
  end if;
end $$;
drop trigger if exists zeit_stempel_verlauf on public.zeit_stempel;
create trigger zeit_stempel_verlauf after insert or update or delete on public.zeit_stempel
  for each row execute function public.zeit_stempel_verlauf();

alter table public.zeit_stempel enable row level security;
alter table public.zeit_verlauf enable row level security;

drop policy if exists "zeit eigene oder admin lesen" on public.zeit_stempel;
create policy "zeit eigene oder admin lesen" on public.zeit_stempel for select to authenticated
  using ((select bin_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
drop policy if exists "zeit eigene oder admin anlegen" on public.zeit_stempel;
create policy "zeit eigene oder admin anlegen" on public.zeit_stempel for insert to authenticated
  with check ((select bin_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
drop policy if exists "zeit eigene oder admin aendern" on public.zeit_stempel;
create policy "zeit eigene oder admin aendern" on public.zeit_stempel for update to authenticated
  using ((select bin_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())))
  with check ((select bin_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
drop policy if exists "zeit eigene oder admin loeschen" on public.zeit_stempel;
create policy "zeit eigene oder admin loeschen" on public.zeit_stempel for delete to authenticated
  using ((select bin_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));

drop policy if exists "zeitverlauf eigene oder admin" on public.zeit_verlauf;
create policy "zeitverlauf eigene oder admin" on public.zeit_verlauf for select to authenticated
  using ((select bin_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));

-- Je Person: Stundenlohn oder Monatslohn (Wunsch Patrick 18. November 2026:
-- „es gibt Stundenlöhner und Monatslöhner“). Monatslöhner haben eine
-- Sollzeit je Woche (bei 100 %) und ein Pensum; daraus rechnet die App den
-- Saldo. Stundenlöhner: nur die geleisteten Stunden. Saldo-Übertrag aus dem
-- bisherigen System in saldo_start_min ab saldo_start_tag.
create table if not exists public.zeit_personen (
  person_id uuid primary key references public.profiles(id) on delete cascade,
  lohnart text not null default 'monat' check (lohnart in ('monat', 'stunde')),
  soll_woche_h numeric not null default 42.5,
  pensum numeric not null default 100,
  saldo_start_tag date,
  saldo_start_min integer not null default 0,
  erfasst boolean not null default true,
  notiz text,
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
-- Namen, unter denen die Person auf der Planwand bei den Ferien steht
-- (dort freier Text, etwa „Michel“ oder „Michel Bolinger“)
alter table public.zeit_personen add column if not exists ferien_namen text[] not null default '{}';
alter table public.zeit_personen enable row level security;
drop policy if exists "zeitpersonen lesen" on public.zeit_personen;
create policy "zeitpersonen lesen" on public.zeit_personen for select to authenticated
  using ((select bin_admin()) or (person_id = (select auth.uid()) and (select zeit_darf())));
drop policy if exists "zeitpersonen admin" on public.zeit_personen;
create policy "zeitpersonen admin" on public.zeit_personen for all to authenticated
  using ((select bin_admin())) with check ((select bin_admin()));

-- Sollzeit je Wochentag (Personenprofil, Teilpensen): {"1": 8.5, …}, 1 = Montag, leer = gleichmässig Mo–Fr
alter table public.zeit_personen add column if not exists soll_tage jsonb;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'zeit_stempel')
  and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'zeit_verlauf')
  then 'ok' else 'FEHLT' end as probe;
