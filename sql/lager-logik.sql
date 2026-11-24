-- =================================================================
--  LAGER MIT LOGIK (seit 1.791.0, Wunsch Patrick 24. November 2026)
--  Baut auf lager_buchungen (sql/lager-teile.sql) auf.
--  - Jede Buchung kennt jetzt Index, Art der Teile (roh, teil, fertig),
--    Grund (Produktion, zurück von extern, Kundenrückgabe, extern raus,
--    Auslieferung, Korrektur), den externen Arbeitsschritt und die Stufe
--    (wie viele Schritte des Ablaufs schon gemacht sind).
--  - lager_extern: externe Arbeitsschritte (Firma, übliche Dauer,
--    wie viele Arbeitstage vorher man die Firma informieren muss).
--  - lager_ablauf: je HOCO Nr. die Reihenfolge der externen Schritte.
--  - lager_avis: welcher Auftrag bei welcher Firma schon angekündigt ist.
--  Lesen und schreiben nur Admins. Gefahrlos mehrfach ausführbar, ohne drop.
-- =================================================================
alter table public.lager_buchungen add column if not exists index_nr text;
alter table public.lager_buchungen add column if not exists art text;
alter table public.lager_buchungen add column if not exists grund text;
alter table public.lager_buchungen add column if not exists ext_id uuid;
alter table public.lager_buchungen add column if not exists stufe integer;
alter table public.lager_buchungen add column if not exists bezug_id uuid;
alter table public.lager_buchungen add column if not exists zurueck_bis date;
alter table public.lager_buchungen add column if not exists erledigt boolean not null default false;

create table if not exists public.lager_extern (
  id uuid primary key default gen_random_uuid(),
  schritt text not null,
  firma text,
  dauer_tage integer,
  vorlauf_tage integer,
  kontakt text,
  notiz text,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.lager_ablauf (
  hoco_nr text primary key,
  schritte jsonb not null default '[]'::jsonb,
  notiz text,
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);

create table if not exists public.lager_avis (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  ext_id uuid not null references public.lager_extern(id) on delete cascade,
  notiz text,
  am timestamptz not null default now(),
  von uuid default auth.uid(),
  unique (job_id, ext_id)
);

alter table public.lager_extern enable row level security;
alter table public.lager_ablauf enable row level security;
alter table public.lager_avis enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lager_extern', 'lager_ablauf', 'lager_avis'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'lager nur admins') then
      execute format('create policy "lager nur admins" on public.%I for all to authenticated using ((select bin_admin())) with check ((select bin_admin()))', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

select case when
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lager_buchungen' and column_name = 'stufe')
  and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lager_extern')
  and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lager_ablauf')
  and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lager_avis')
  then 'ok' else 'FEHLT' end as probe;
