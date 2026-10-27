-- Kalkulation wie im Gewatec (Wunsch Patrick 27. Oktober 2026: „im
-- HoferTool einbauen, nur für Patrick Ruch“)
--
-- Was diese Datei tut:
--   1. Tabelle kalkulationen: je Kalkulation Nummer, Kunde, Artikel und
--      alles Eingetragene (Material, Arbeitsgänge, Staffeln, Preis) als
--      ein Datenfeld.
--   2. Tabelle kalk_maschinen: die Stundensätze der Maschinen mit ihren
--      Grundlagen (Anschaffung, Zins, Raum, Lohn, Strom …).
--   3. Lesen und schreiben darf beides nur, wer am Konto den Vermerk
--      kalkulationSehen hat. Den bekommt hier nur Patrick (über seine
--      Kennung, damit kein Name im Repository steht).
-- Gefahrlos mehrfach ausführbar, ohne „drop“.

create table if not exists public.kalkulationen (
  id uuid primary key default gen_random_uuid(),
  nr text,
  kunde text,
  artikel text,
  daten jsonb not null default '{}'::jsonb,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);

create table if not exists public.kalk_maschinen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort integer not null default 0,
  daten jsonb not null default '{}'::jsonb,
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);

-- Wer den Vermerk hat
create or replace function public.kalkulation_darf()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (p.einstellungen->>'kalkulationSehen')::boolean
                     from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.kalkulation_darf() from public, anon;
grant execute on function public.kalkulation_darf() to authenticated;

alter table public.kalkulationen enable row level security;
alter table public.kalk_maschinen enable row level security;
grant select, insert, update, delete on public.kalkulationen to authenticated;
grant select, insert, update, delete on public.kalk_maschinen to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'kalkulationen' and policyname = 'kalkulation nur mit vermerk') then
    create policy "kalkulation nur mit vermerk" on public.kalkulationen for all to authenticated
      using ((select public.kalkulation_darf())) with check ((select public.kalkulation_darf()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'kalk_maschinen' and policyname = 'kalk maschinen nur mit vermerk') then
    create policy "kalk maschinen nur mit vermerk" on public.kalk_maschinen for all to authenticated
      using ((select public.kalkulation_darf())) with check ((select public.kalkulation_darf()));
  end if;
end $$;

-- Patrick bekommt den Vermerk
update public.profiles
   set einstellungen = coalesce(einstellungen, '{}'::jsonb) || '{"kalkulationSehen": true}'::jsonb
 where id = '38ab42d6-da0b-48bc-a71a-8fe305843aa4';

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle kalkulationen' as punkt,
       case when to_regclass('public.kalkulationen') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Tabelle kalk_maschinen',
       case when to_regclass('public.kalk_maschinen') is not null then 'ok' else 'FEHLT' end
union all
select 'Regeln (2)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename in ('kalkulationen', 'kalk_maschinen')) >= 2 then 'ok' else 'FEHLT' end
union all
select 'Vermerk bei Patrick',
       case when exists (select 1 from public.profiles
         where id = '38ab42d6-da0b-48bc-a71a-8fe305843aa4'
           and (einstellungen->>'kalkulationSehen')::boolean) then 'ok' else 'FEHLT' end;
