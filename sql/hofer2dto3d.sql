-- =================================================================
--  HOFER2DTO3D: Fertigungszeichnung und STEP-Datei nebeneinander
--
--  Wunsch Patrick 17. November 2026: „du hast mir Fertigungszeichnungen
--  in STEP-Files umgewandelt. Ich will das im HoferTool haben … es soll
--  das PDF zeigen und daneben das erstellte STEP-File mit 3D-Ansicht
--  zum Downloaden.“
--
--  Was das Skript macht:
--   - neue Tabelle zeichnung_3d: je Eintrag HOCO Nr., Bezeichnung,
--     Notiz, das PDF der Zeichnung und die STEP-Datei (Adresse in der
--     Ablage „zeichnungen“ unter „2dto3d/“), wer und wann
--   - lesen dürfen alle Angemeldeten ausser Externen und Dienst
--   - hochladen, ändern und löschen alle mit Schreibrecht ausser Externen
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.zeichnung_3d (
  id           uuid primary key default gen_random_uuid(),
  hoco         text,
  titel        text not null,
  notiz        text,
  pdf_url      text,
  pdf_pfad     text,
  pdf_name     text,
  step_url     text,
  step_pfad    text,
  step_name    text,
  step_groesse bigint,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
create index if not exists zeichnung_3d_hoco on public.zeichnung_3d (hoco);

alter table public.zeichnung_3d enable row level security;
grant select, insert, update, delete on public.zeichnung_3d to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'zeichnung_3d' and policyname = 'zeichnung_3d lesen') then
    create policy "zeichnung_3d lesen" on public.zeichnung_3d for select to authenticated
      using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'zeichnung_3d' and policyname = 'zeichnung_3d anlegen') then
    create policy "zeichnung_3d anlegen" on public.zeichnung_3d for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'zeichnung_3d' and policyname = 'zeichnung_3d aendern') then
    create policy "zeichnung_3d aendern" on public.zeichnung_3d for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'zeichnung_3d' and policyname = 'zeichnung_3d loeschen') then
    create policy "zeichnung_3d loeschen" on public.zeichnung_3d for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle zeichnung_3d' as punkt,
       case when to_regclass('public.zeichnung_3d') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (4)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename = 'zeichnung_3d') >= 4 then 'ok' else 'FEHLT' end;
