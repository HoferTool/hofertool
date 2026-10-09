-- =================================================================
--  DRUCKEN ÜBER DEN POOL-RECHNER
--
--  iPad und Handy hängen am WLAN Hofer&Co und kommen nicht an den
--  Sharp-Drucker im Firmennetz (Wunsch Patrick, 9. Oktober 2026).
--  Darum legt der Knopf „Drucken“ im Betrachter einen Druckauftrag
--  hier ab. Der Pool-Rechner (drucken.ps1, gestartet von der Aufgabe
--  „HoferTool“) schaut alle paar Sekunden nach, druckt und meldet
--  „fertig“ oder den Fehler zurück.
--
--  Was diese Datei anlegt:
--   - Tabelle druckauftraege: ein Auftrag je Druck. Anlegen darf jeder
--     Angemeldete ausser Externen, abarbeiten nur das Dienstkonto.
--   - Ablage „druck“ (nicht öffentlich): die Seiten einer PDF oder ein
--     Foto als JPG-Bilder. Das Dienstkonto löscht sie nach dem Druck.
--   - app_config „druck“ (welcher Drucker, schreiben Admin und Planwand)
--     und „druck_status“ (Drucker am Pool-Rechner, schreibt das Dienstkonto).
--
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

create table if not exists public.druckauftraege (
  id uuid primary key default gen_random_uuid(),
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  wer text,
  titel text,
  art text not null default 'bilder' check (art in ('bilder', 'excel')),
  quelle text,
  blatt text,
  seiten int not null default 0,
  quer boolean not null default false,
  kopien int not null default 1 check (kopien between 1 and 20),
  zustand text not null default 'offen' check (zustand in ('offen', 'druckt', 'fertig', 'fehler')),
  meldung text,
  drucker text,
  erledigt_am timestamptz
);
create index if not exists druckauftraege_offen on public.druckauftraege (erstellt_am) where zustand = 'offen';

alter table public.druckauftraege enable row level security;

drop policy if exists "druck lesen" on public.druckauftraege;
create policy "druck lesen" on public.druckauftraege for select to authenticated
  using ((select darf_lesen()) and not (select ist_extern()));

drop policy if exists "druck anlegen" on public.druckauftraege;
create policy "druck anlegen" on public.druckauftraege for insert to authenticated
  with check ((select darf_lesen()) and not (select ist_extern())
    and erstellt_von = (select auth.uid()) and zustand = 'offen');

drop policy if exists "druck abarbeiten" on public.druckauftraege;
create policy "druck abarbeiten" on public.druckauftraege for update to authenticated
  using ((select bin_dienst())) with check ((select bin_dienst()));

drop policy if exists "druck loeschen" on public.druckauftraege;
create policy "druck loeschen" on public.druckauftraege for delete to authenticated
  using ((select bin_dienst()) or (select bin_admin())
    or (erstellt_von = (select auth.uid()) and zustand = 'offen'));

grant select, insert, update, delete on public.druckauftraege to authenticated;
revoke all on public.druckauftraege from anon;

-- Ablage für die Seiten, nicht öffentlich
insert into storage.buckets (id, name, public, file_size_limit)
values ('druck', 'druck', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "druck hochladen" on storage.objects;
create policy "druck hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'druck' and (select darf_lesen()) and not (select ist_extern()));

drop policy if exists "druck holen" on storage.objects;
create policy "druck holen" on storage.objects for select to authenticated
  using (bucket_id = 'druck' and ((select bin_dienst()) or owner = (select auth.uid())));

drop policy if exists "druck wegraeumen" on storage.objects;
create policy "druck wegraeumen" on storage.objects for delete to authenticated
  using (bucket_id = 'druck' and ((select bin_dienst()) or owner = (select auth.uid())));

-- Einstellungen: Drucker wählen (Admin darf ohnehin alles), Stand melden
drop policy if exists "planwand druck" on public.app_config;
create policy "planwand druck" on public.app_config for all to authenticated
  using (schluessel = 'druck' and (select bin_planwand()))
  with check (schluessel = 'druck' and (select bin_planwand()));

drop policy if exists "dienst meldet druck" on public.app_config;
create policy "dienst meldet druck" on public.app_config for all to authenticated
  using (schluessel = 'druck_status' and (select bin_dienst()))
  with check (schluessel = 'druck_status' and (select bin_dienst()));

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables where table_name = 'druckauftraege')
  and exists (select 1 from storage.buckets where id = 'druck')
  and exists (select 1 from pg_policies where tablename = 'app_config' and policyname = 'dienst meldet druck')
  then 'ok' else 'FEHLT' end as drucken_pool;
