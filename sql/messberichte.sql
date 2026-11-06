-- =================================================================
--  MESSBERICHTE VOM KEYENCE IM (1.443.0, Wunsch Patrick 6. November 2026:
--  „wenn man auf Print drückt, in einem Ordner abspeichern zum Hochladen
--  ins Tool, automatisch so benennen, dass das Tool weiss, wohin“)
--
--  Das Bildmessgerät Keyence IM schreibt je Messung einen „Teilbericht“
--  als CSV-Datei (Name der Messeinstellung + BERICHT + Zeit). Das Programm
--  keyence.ps1 am Pool-Rechner liest diese Dateien im Ordner
--  W:\KONTROLLE\Keyence (oder dem Ordner in app_config.keyence_ordner)
--  und legt Kopf und Messwerte hier ab. Die HOCO Nr. kommt aus dem Namen
--  der Messeinstellung („10007-0589 1. Seite M2 SMO“).
--
--    messberichte     je Datei eine Zeile
--    keyence_status   in app_config: was das Programm zuletzt gesehen hat
--
--  Lesen: alle, die lesen dürfen, ausser Externen. Schreiben: nur das
--  Dienstkonto (das Programm) und Admins.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.messberichte (
  id           uuid primary key default gen_random_uuid(),
  datei        text not null unique,
  hoco_nr      text,
  einstellung  text,
  gemessen_am  timestamptz,
  ergebnis     text,
  kopf         jsonb not null default '{}'::jsonb,
  spalten      jsonb not null default '[]'::jsonb,
  zeilen       jsonb not null default '[]'::jsonb,
  roh          text,
  gelesen_am   timestamptz not null default now()
);
create index if not exists messberichte_hoco on public.messberichte (hoco_nr, gemessen_am desc);
alter table public.messberichte enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'messberichte' and policyname = 'lesen') then
    create policy "lesen" on public.messberichte for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'messberichte' and policyname = 'dienst schreibt') then
    create policy "dienst schreibt" on public.messberichte for all to authenticated
      using ((select public.bin_dienst()) or (select public.bin_admin()))
      with check ((select public.bin_dienst()) or (select public.bin_admin()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'app_config' and policyname = 'dienst meldet keyence') then
    create policy "dienst meldet keyence" on public.app_config for all to authenticated
      using (schluessel = 'keyence_status' and (select public.bin_dienst()))
      with check (schluessel = 'keyence_status' and (select public.bin_dienst()));
  end if;
end $$;

grant select, insert, update, delete on public.messberichte to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle messberichte' as was,
       case when exists (select 1 from pg_policies where tablename = 'messberichte' and policyname = 'dienst schreibt')
            then 'ok' else 'FEHLT' end as stand
union all select 'Stand melden',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'dienst meldet keyence') then 'ok' else 'FEHLT' end;
