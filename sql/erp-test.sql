-- Test ERP System (Wunsch Patrick 20. November 2026: „neuer Reiter
-- Test ERP, vorläufig nur für mich“, Pflichtenheft im Thread „Test ERP
-- System“). Lohnfertigung von Präzisionsteilen, durchgängig vom
-- Stamm bis zur Rechnung, mit Index und Rückverfolgbarkeit.
--
-- Was diese Datei tut:
--   1. Funktion erp_darf(): nur wer am Konto den Vermerk erpSehen hat.
--   2. Tabellen
--      erp_partner      Lieferanten und Kunden (5-stellige Nr. je Art),
--                       Adressen, Kontakte, Anschriften in daten
--      erp_bedingungen  Liefer- und Zahlungsbedingungen
--      erp_lager        Lagerarten und Lagerplätze
--      erp_artikel      Hofer-Artikel (xxxxx-xxxx) mit Index, Rohmaterial,
--                       Werkzeuge; je Nr. und Index eine Zeile, Arbeitsplan
--      erp_belege       Aufträge, Bestellungen, Fertigungsaufträge,
--                       Lieferscheine, Rechnungen, Gutschriften, Proforma
--      erp_positionen   Positionen der Belege
--      erp_bewegungen   jede Lagerbewegung mit Charge: Grundlage für
--                       Bestand und Rückverfolgung
--   3. Prüfung in der Datenbank: eine Lagerbewegung zu einer Position
--      muss denselben Artikel samt Index haben (Index A beliefert nie
--      einen Auftrag mit Index B).
--   4. Patrick bekommt den Vermerk (über seine Kennung).
-- Gefahrlos mehrfach ausführbar, ohne „drop“.

create or replace function public.erp_darf()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (p.einstellungen->>'erpSehen')::boolean
                     from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.erp_darf() from public, anon;
grant execute on function public.erp_darf() to authenticated;

create table if not exists public.erp_partner (
  id uuid primary key default gen_random_uuid(),
  art text not null check (art in ('lieferant', 'kunde')),
  nr text not null,
  name text not null,
  gruppe text,
  aktiv boolean not null default true,
  daten jsonb not null default '{}'::jsonb,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz not null default now(),
  unique (art, nr)
);

create table if not exists public.erp_bedingungen (
  id uuid primary key default gen_random_uuid(),
  art text not null check (art in ('liefer', 'zahlung')),
  code text not null,
  text text not null,
  tage integer,
  skonto_pct numeric,
  skonto_tage integer,
  unique (art, code)
);

create table if not exists public.erp_lager (
  id uuid primary key default gen_random_uuid(),
  lagerart text not null,
  platz text not null,
  bezeichnung text,
  unique (lagerart, platz)
);

create table if not exists public.erp_artikel (
  id uuid primary key default gen_random_uuid(),
  art text not null check (art in ('hofer', 'rohmaterial', 'werkzeug')),
  nr text not null,
  idx text not null default '',
  bezeichnung text,
  zeichnung text,
  kunde_id uuid references public.erp_partner(id) on delete set null,
  einheit text not null default 'Stk',
  preis numeric,
  kalkulation_id uuid,
  arbeitsplan jsonb not null default '[]'::jsonb,
  aktiv boolean not null default true,
  daten jsonb not null default '{}'::jsonb,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  unique (art, nr, idx)
);

create table if not exists public.erp_belege (
  id uuid primary key default gen_random_uuid(),
  typ text not null check (typ in ('auftrag', 'bestellung', 'fertigung', 'lieferschein', 'rechnung', 'gutschrift', 'proforma')),
  nr text not null,
  partner_id uuid references public.erp_partner(id) on delete set null,
  art text not null default 'einzel',
  status text not null default 'offen',
  datum date not null default current_date,
  bezug_id uuid references public.erp_belege(id) on delete set null,
  daten jsonb not null default '{}'::jsonb,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz not null default now(),
  unique (typ, nr)
);

create table if not exists public.erp_positionen (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.erp_belege(id) on delete cascade,
  pos integer not null default 10,
  artikel_id uuid references public.erp_artikel(id) on delete set null,
  text text,
  menge numeric not null default 0,
  einheit text default 'Stk',
  preis numeric,
  termin date,
  termin_kw text,
  bezug_id uuid references public.erp_positionen(id) on delete set null,
  daten jsonb not null default '{}'::jsonb
);
create index if not exists erp_positionen_beleg on public.erp_positionen (beleg_id, pos);

create table if not exists public.erp_bewegungen (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.erp_artikel(id),
  lager_id uuid references public.erp_lager(id) on delete set null,
  charge text not null,
  menge numeric not null,
  art text not null,
  beleg_id uuid references public.erp_belege(id) on delete set null,
  position_id uuid references public.erp_positionen(id) on delete set null,
  herkunft text,
  notiz text,
  am timestamptz not null default now(),
  von uuid default auth.uid()
);
create index if not exists erp_bewegungen_artikel on public.erp_bewegungen (artikel_id, charge);

-- Index durchgängig: Bewegung zu einer Position nur mit demselben Artikel
-- (Lieferschein, Wareneingang, Fertigmeldung). Ausnahme: Materialentnahme
-- im Fertigungsauftrag (art 'entnahme'), dort ist es das Rohmaterial.
create or replace function public.erp_bewegung_pruefen()
returns trigger language plpgsql as $$
declare a uuid;
begin
  if new.position_id is not null and new.art <> 'entnahme' then
    select artikel_id into a from public.erp_positionen where id = new.position_id;
    if a is not null and a <> new.artikel_id then
      raise exception 'Artikel oder Index passt nicht zur Position (Index muss durchgängig sein).';
    end if;
  end if;
  return new;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'erp_bewegung_index') then
    create trigger erp_bewegung_index before insert or update on public.erp_bewegungen
      for each row execute function public.erp_bewegung_pruefen();
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['erp_partner','erp_bedingungen','erp_lager','erp_artikel','erp_belege','erp_positionen','erp_bewegungen'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp nur mit vermerk') then
      execute format('create policy "erp nur mit vermerk" on public.%I for all to authenticated using ((select public.erp_darf())) with check ((select public.erp_darf()))', t);
    end if;
  end loop;
end $$;

-- Vorgaben für Bedingungen und Lager, nur wenn noch leer
insert into public.erp_bedingungen (art, code, text, tage, skonto_pct, skonto_tage)
select * from (values
  ('zahlung', '30N', '30 Tage netto', 30, null::numeric, null::integer),
  ('zahlung', '10S2', '10 Tage 2 % Skonto, 30 Tage netto', 30, 2, 10),
  ('zahlung', 'VK', 'Vorauskasse', 0, null, null),
  ('liefer', 'FD', 'franko Domizil, inkl. Verpackung', null, null, null),
  ('liefer', 'AW', 'ab Werk Lohn-Ammannsegg', null, null, null),
  ('liefer', 'DAP', 'DAP Incoterms 2020', null, null, null)
) v(art, code, text, tage, skonto_pct, skonto_tage)
where not exists (select 1 from public.erp_bedingungen);

insert into public.erp_lager (lagerart, platz, bezeichnung)
select * from (values
  ('Fertigteile', 'FT-01', 'Fertigteillager Regal 1'),
  ('Rohmaterial', 'RM-01', 'Stangenlager'),
  ('Werkzeuge', 'WZ-01', 'Werkzeugschrank'),
  ('Sperrlager', 'SP-01', 'Gesperrte Teile / QS')
) v(lagerart, platz, bezeichnung)
where not exists (select 1 from public.erp_lager);

update public.profiles
   set einstellungen = coalesce(einstellungen, '{}'::jsonb) || '{"erpSehen": true}'::jsonb
 where id = '38ab42d6-da0b-48bc-a71a-8fe305843aa4';

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabellen (7)' as punkt,
       case when (select count(*) from pg_tables where schemaname = 'public' and tablename like 'erp\_%') >= 7 then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (7)', case when (select count(*) from pg_policies where schemaname = 'public' and policyname = 'erp nur mit vermerk') >= 7 then 'ok' else 'FEHLT' end
union all
select 'Index-Prüfung', case when exists (select 1 from pg_trigger where tgname = 'erp_bewegung_index') then 'ok' else 'FEHLT' end
union all
select 'Vermerk Patrick', case when exists (select 1 from public.profiles where (einstellungen->>'erpSehen')::boolean) then 'ok' else 'FEHLT' end;
