-- =================================================================
--  INFOBOARD
--
--  Ein grosser Bildschirm (Samsung QM43B-T, 43 Zoll, hochkant) zeigt
--  oben Logo, Uhr, Wetter und Solaranlage wie die Startseite, darunter
--  Bereiche mit PDFs, Bildern oder Videos und eine Fläche zum Zeichnen
--  und Schreiben (Wunsch Patrick 20. Oktober 2026). Gestaltet wird in
--  der App auf der Seite „Infoboard“.
--
--  Was das Skript macht:
--   - neue Tabelle infoboard: der Aufbau (welcher Bereich wo, welche
--     Datei), eine Zeile je Bildschirm, zuerst nur „haupt“
--   - neue Tabelle infoboard_skizzen: was auf den Zeichenflächen steht
--   - lesen dürfen alle Angemeldeten ausser Externen
--   - den Aufbau ändern nur Admins
--   - zeichnen dürfen alle ausser Externen, auch direkt am Bildschirm
--  Die Dateien liegen in der Ablage „zeichnungen“ im Ordner
--  „infoboard/“. Beides kommt mit in die tägliche Sicherung.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.infoboard (
  id            text primary key default 'haupt',
  aufbau        jsonb not null default '{}'::jsonb,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);

create table if not exists public.infoboard_skizzen (
  bereich       text primary key,
  striche       jsonb not null default '[]'::jsonb,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);

alter table public.infoboard enable row level security;
alter table public.infoboard_skizzen enable row level security;
grant select, insert, update, delete on public.infoboard to authenticated;
grant select, insert, update, delete on public.infoboard_skizzen to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“, damit das Skript
-- auch über die Supabase-Verbindung ohne Rückfrage läuft)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard' and policyname = 'infoboard lesen') then
    create policy "infoboard lesen" on public.infoboard for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard' and policyname = 'infoboard anlegen') then
    create policy "infoboard anlegen" on public.infoboard for insert to authenticated
      with check ((select public.bin_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard' and policyname = 'infoboard aendern') then
    create policy "infoboard aendern" on public.infoboard for update to authenticated
      using ((select public.bin_admin())) with check ((select public.bin_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard' and policyname = 'infoboard loeschen') then
    create policy "infoboard loeschen" on public.infoboard for delete to authenticated
      using ((select public.bin_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard_skizzen' and policyname = 'infoboard skizzen') then
    create policy "infoboard skizzen" on public.infoboard_skizzen for all to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()))
      with check ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle infoboard' as punkt,
       case when to_regclass('public.infoboard') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Tabelle infoboard_skizzen',
       case when to_regclass('public.infoboard_skizzen') is not null then 'ok' else 'FEHLT' end
union all
select 'Regeln (5)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename in ('infoboard', 'infoboard_skizzen')) >= 5 then 'ok' else 'FEHLT' end;
