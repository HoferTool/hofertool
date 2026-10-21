-- =================================================================
--  MASCHINEN: INFOS, WARTUNG UND BACKUP-BATTERIEN
--
--  Für die neue Seite „Maschinen“ (Wunsch Patrick 21. Oktober 2026):
--   - maschinen_info: je Maschine ein Feld für allgemeine Infos und
--     der Termin für den Wechsel der Backup-Batterien (zuletzt
--     gewechselt, nächster Wechsel, Hinweis ein oder aus)
--   - maschinen_wartung: die Wartungshistorie, je Eintrag Datum, was
--     gemacht wurde, wer, und angehängte Bilder oder PDFs (die Dateien
--     liegen in der Ablage „zeichnungen“ unter maschinen/…/wartung/)
--  Lesen dürfen alle Angemeldeten ausser Externen, schreiben alle mit
--  Schreibrecht ausser Externen. Einen Wartungseintrag löschen darf,
--  wer ihn geschrieben hat, und Admins.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.maschinen_info (
  machine_id          uuid primary key references public.machines(id) on delete cascade,
  info                text,
  batterie_gewechselt date,
  batterie_faellig    date,
  batterie_hinweis    boolean not null default true,
  geaendert_am        timestamptz not null default now(),
  geaendert_von       uuid default auth.uid()
);

create table if not exists public.maschinen_wartung (
  id            uuid primary key default gen_random_uuid(),
  machine_id    uuid not null references public.machines(id) on delete cascade,
  datum         date not null default current_date,
  text          text not null,
  anhaenge      jsonb not null default '[]'::jsonb,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz
);
create index if not exists maschinen_wartung_maschine on public.maschinen_wartung (machine_id, datum desc);

alter table public.maschinen_info enable row level security;
alter table public.maschinen_wartung enable row level security;
grant select, insert, update, delete on public.maschinen_info to authenticated;
grant select, insert, update, delete on public.maschinen_wartung to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_info' and policyname = 'maschinen_info lesen') then
    create policy "maschinen_info lesen" on public.maschinen_info for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_info' and policyname = 'maschinen_info anlegen') then
    create policy "maschinen_info anlegen" on public.maschinen_info for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_info' and policyname = 'maschinen_info aendern') then
    create policy "maschinen_info aendern" on public.maschinen_info for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_info' and policyname = 'maschinen_info loeschen') then
    create policy "maschinen_info loeschen" on public.maschinen_info for delete to authenticated
      using ((select public.bin_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_wartung' and policyname = 'wartung lesen') then
    create policy "wartung lesen" on public.maschinen_wartung for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_wartung' and policyname = 'wartung anlegen') then
    create policy "wartung anlegen" on public.maschinen_wartung for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_wartung' and policyname = 'wartung aendern') then
    create policy "wartung aendern" on public.maschinen_wartung for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_wartung' and policyname = 'wartung loeschen') then
    create policy "wartung loeschen" on public.maschinen_wartung for delete to authenticated
      using ((select public.bin_admin()) or erstellt_von = (select auth.uid()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle maschinen_info' as punkt,
       case when to_regclass('public.maschinen_info') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Tabelle maschinen_wartung',
       case when to_regclass('public.maschinen_wartung') is not null then 'ok' else 'FEHLT' end
union all
select 'Regeln (8)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename in ('maschinen_info', 'maschinen_wartung')) >= 8 then 'ok' else 'FEHLT' end;
