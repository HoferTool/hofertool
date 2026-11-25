-- HOFERTIME: Kiosk (Wunsch Patrick 25. November 2026: „Twint-Gebühren abschaffen …
-- per HOFERTIME auf Kiosk, Sachen kaufen, man belastet das Konto, und wenn man
-- abrechnen will, kommt eine Rechnung mit QR-Einzahlungsschein“)
--
-- Was diese Datei tut, in einfachen Worten:
--  * kiosk_artikel: was man kaufen kann (Name, Preis, Zeichen). Ändern nur der
--    Admin von HOFERTIME (zeit_admin), sehen alle, die Zeiten erfassen.
--  * kiosk_buchungen: jeder Kauf geht aufs eigene Konto. Kaufen nur für sich
--    selbst; eigene Käufe der letzten 10 Minuten, die noch nicht abgerechnet
--    sind, lassen sich zurücknehmen. Der Admin sieht und ändert alles.
--  * kiosk_rechnungen: „Abrechnen“ (kiosk_abrechnen) fasst alle offenen Käufe
--    einer Person zu einer Rechnung zusammen. Die Referenz für den
--    QR-Einzahlungsschein rechnet die App aus der Rechnungsnummer.
--    „Bezahlt“ setzt nur der Admin.
--  * kiosk_konto: eine Zeile mit IBAN und Adresse für den Einzahlungsschein,
--    ändern nur der Admin.
--  Externe, Dienst und Gerätekonten haben keinen Zugang (zeit_darf).
-- Gefahrlos mehrfach ausführbar.

create table if not exists public.kiosk_artikel (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  preis numeric(8,2) not null check (preis >= 0),
  zeichen text,
  aktiv boolean not null default true,
  sort integer not null default 0,
  erstellt_am timestamptz not null default now()
);

create table if not exists public.kiosk_rechnungen (
  id uuid primary key default gen_random_uuid(),
  nr bigserial unique,
  person_id uuid not null references auth.users(id) on delete cascade,
  betrag numeric(10,2) not null,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  bezahlt_am timestamptz,
  bezahlt_von uuid
);

create table if not exists public.kiosk_buchungen (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references auth.users(id) on delete cascade,
  artikel_id uuid references public.kiosk_artikel(id) on delete set null,
  name text not null,
  preis numeric(8,2) not null,
  menge integer not null default 1 check (menge > 0 and menge <= 99),
  am timestamptz not null default now(),
  von uuid default auth.uid(),
  rechnung_id uuid references public.kiosk_rechnungen(id) on delete set null
);
create index if not exists kiosk_buchungen_person on public.kiosk_buchungen (person_id, am desc);
create index if not exists kiosk_buchungen_rechnung on public.kiosk_buchungen (rechnung_id);
create index if not exists kiosk_rechnungen_person on public.kiosk_rechnungen (person_id, erstellt_am desc);

create table if not exists public.kiosk_konto (
  id integer primary key default 1 check (id = 1),
  daten jsonb not null default '{}'::jsonb,
  geaendert_am timestamptz not null default now()
);
insert into public.kiosk_konto (id, daten) values
  (1, '{"name": "Hofer + Co. Präzisionsdrehteile", "plz": "4573", "ort": "Lohn-Ammannsegg", "land": "CH"}')
  on conflict (id) do nothing;

alter table public.kiosk_artikel enable row level security;
alter table public.kiosk_buchungen enable row level security;
alter table public.kiosk_rechnungen enable row level security;
alter table public.kiosk_konto enable row level security;

drop policy if exists "kiosk artikel lesen" on public.kiosk_artikel;
create policy "kiosk artikel lesen" on public.kiosk_artikel for select to authenticated
  using ((select zeit_darf()) or (select zeit_admin()));
drop policy if exists "kiosk artikel admin" on public.kiosk_artikel;
create policy "kiosk artikel admin" on public.kiosk_artikel for all to authenticated
  using ((select zeit_admin())) with check ((select zeit_admin()));

drop policy if exists "kiosk buchungen lesen" on public.kiosk_buchungen;
create policy "kiosk buchungen lesen" on public.kiosk_buchungen for select to authenticated
  using ((select zeit_admin()) or person_id = (select auth.uid()));
drop policy if exists "kiosk buchungen kaufen" on public.kiosk_buchungen;
create policy "kiosk buchungen kaufen" on public.kiosk_buchungen for insert to authenticated
  with check ((select zeit_admin())
    or (person_id = (select auth.uid()) and (select zeit_darf()) and rechnung_id is null));
drop policy if exists "kiosk buchungen zuruecknehmen" on public.kiosk_buchungen;
create policy "kiosk buchungen zuruecknehmen" on public.kiosk_buchungen for delete to authenticated
  using ((select zeit_admin())
    or (person_id = (select auth.uid()) and rechnung_id is null and am > now() - interval '10 minutes'));
drop policy if exists "kiosk buchungen admin" on public.kiosk_buchungen;
create policy "kiosk buchungen admin" on public.kiosk_buchungen for update to authenticated
  using ((select zeit_admin())) with check ((select zeit_admin()));

drop policy if exists "kiosk rechnungen lesen" on public.kiosk_rechnungen;
create policy "kiosk rechnungen lesen" on public.kiosk_rechnungen for select to authenticated
  using ((select zeit_admin()) or person_id = (select auth.uid()));
drop policy if exists "kiosk rechnungen admin" on public.kiosk_rechnungen;
create policy "kiosk rechnungen admin" on public.kiosk_rechnungen for all to authenticated
  using ((select zeit_admin())) with check ((select zeit_admin()));

drop policy if exists "kiosk konto lesen" on public.kiosk_konto;
create policy "kiosk konto lesen" on public.kiosk_konto for select to authenticated
  using ((select zeit_darf()) or (select zeit_admin()));
drop policy if exists "kiosk konto admin" on public.kiosk_konto;
create policy "kiosk konto admin" on public.kiosk_konto for all to authenticated
  using ((select zeit_admin())) with check ((select zeit_admin()));

-- Preis und Name kommen beim Kaufen immer aus dem Artikel, nicht vom Gerät
create or replace function public.kiosk_buchung_pruefen() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if public.zeit_admin() and new.artikel_id is null then return new; end if;
  select name, preis, aktiv into a from public.kiosk_artikel where id = new.artikel_id;
  if not found or not a.aktiv then raise exception 'Artikel gibt es nicht'; end if;
  new.name := a.name;
  new.preis := a.preis;
  new.am := now();
  new.von := auth.uid();
  return new;
end $$;
drop trigger if exists kiosk_buchung_pruefen on public.kiosk_buchungen;
create trigger kiosk_buchung_pruefen before insert on public.kiosk_buchungen
  for each row execute function public.kiosk_buchung_pruefen();

-- Alle offenen Käufe einer Person zu einer Rechnung zusammenfassen.
-- Die Person für sich selbst, der Admin für alle.
create or replace function public.kiosk_abrechnen(p_person uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_person uuid := coalesce(p_person, auth.uid());
  v_summe numeric(10,2);
  v_id uuid;
begin
  if not (public.zeit_admin() or (v_person = auth.uid() and public.zeit_darf())) then
    raise exception 'nicht erlaubt';
  end if;
  select coalesce(sum(preis * menge), 0) into v_summe from public.kiosk_buchungen
    where person_id = v_person and rechnung_id is null;
  if v_summe <= 0 then raise exception 'Nichts offen zum Abrechnen'; end if;
  insert into public.kiosk_rechnungen (person_id, betrag) values (v_person, v_summe) returning id into v_id;
  update public.kiosk_buchungen set rechnung_id = v_id where person_id = v_person and rechnung_id is null;
  return v_id;
end $$;
revoke all on function public.kiosk_abrechnen(uuid) from public, anon;
grant execute on function public.kiosk_abrechnen(uuid) to authenticated;

-- Eine noch offene Rechnung wieder auflösen (falsch abgerechnet): nur Admin
create or replace function public.kiosk_rechnung_aufloesen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.zeit_admin() then raise exception 'nicht erlaubt'; end if;
  if exists (select 1 from public.kiosk_rechnungen where id = p_id and bezahlt_am is not null) then
    raise exception 'Rechnung ist schon bezahlt';
  end if;
  update public.kiosk_buchungen set rechnung_id = null where rechnung_id = p_id;
  delete from public.kiosk_rechnungen where id = p_id;
end $$;
revoke all on function public.kiosk_rechnung_aufloesen(uuid) from public, anon;
grant execute on function public.kiosk_rechnung_aufloesen(uuid) to authenticated;

-- Admin: Namen aller Personen mit Käufen (Konten nur für HOFERTIME eingeschlossen)
create or replace function public.kiosk_personen()
returns table (id uuid, name text) language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email) from public.profiles p
   where public.zeit_admin()
     and (exists (select 1 from public.kiosk_buchungen b where b.person_id = p.id)
       or exists (select 1 from public.kiosk_rechnungen r where r.person_id = p.id));
$$;
revoke all on function public.kiosk_personen() from public, anon;
grant execute on function public.kiosk_personen() to authenticated;

notify pgrst, 'reload schema';

select case when to_regclass('public.kiosk_artikel') is not null
  and to_regclass('public.kiosk_buchungen') is not null
  and to_regclass('public.kiosk_rechnungen') is not null
  and to_regclass('public.kiosk_konto') is not null
  and exists (select 1 from pg_proc where proname = 'kiosk_abrechnen')
  then 'ok' else 'FEHLT' end as probe;
