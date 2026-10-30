-- =================================================================
--  EINLAGEN GEN: einzelne Werkzeuge in der Datenbank
--
--  Beim Erfassen im Reiter „Einlagen Gen (created by Ecker)“ lässt sich
--  jedes Werkzeug einzeln in der App speichern, für alle Geräte (Wunsch
--  Patrick 30. Oktober 2026: „beim Erfassen am Anfang die Werkzeuge
--  einzeln speichern können“). Ein gespeichertes Werkzeug kommt mit
--  einem Tipp in jede Einlage oder geht zum Weiterbearbeiten der Kontur
--  samt Foto wieder auf.
--   - name: Name des Werkzeugs
--   - daten: Kontur in mm (wie „Als Werkzeug speichern“), Tiefe, Mass
--   - projekt: Scan ohne Foto (Blattecken, Pinsel, Kontur, Einstellungen)
--   - foto: das entzerrte Foto als data:-Bild (getrennt, damit die Liste
--     es nicht mitlädt und Änderungen an der Kontur es nicht neu senden)
--   - scan_id: Kennung des Fotos; Werkzeuge vom selben Foto gehören zusammen
--  Lesen, anlegen, ändern und löschen alle Angemeldeten ausser
--  Externen und dem Dienstkonto. Wer und wann setzt die Datenbank.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.einlagen_werkzeuge (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'werkzeug',
  daten         jsonb not null,
  projekt       jsonb,
  foto          text,
  scan_id       text,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create index if not exists einlagen_werkzeuge_geaendert on public.einlagen_werkzeuge (geaendert_am desc);
create index if not exists einlagen_werkzeuge_scan on public.einlagen_werkzeuge (scan_id);

-- Wer und wann wie bei den Einlagen (Funktion aus sql/einlagen.sql)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'einlagen_werkzeuge_stempel') then
    create trigger einlagen_werkzeuge_stempel before insert or update on public.einlagen_werkzeuge
      for each row execute function public.einlagen_stempel();
  end if;
end $$;

alter table public.einlagen_werkzeuge enable row level security;
grant select, insert, update, delete on public.einlagen_werkzeuge to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'einlagen_werkzeuge' and policyname = 'einlagen werkzeuge alle') then
    create policy "einlagen werkzeuge alle" on public.einlagen_werkzeuge for all to authenticated
      using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'))
      with check ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'einlagen_werkzeuge')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'einlagen_werkzeuge')
  and exists (select 1 from pg_trigger where tgname = 'einlagen_werkzeuge_stempel')
  then 'ok' else 'FEHLT' end as einlagen_werkzeuge;
