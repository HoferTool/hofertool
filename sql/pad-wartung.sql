-- =================================================================
--  WARTUNG IM PAD MODE
--
--  Statt der Kachel „Internet“ steht im Pad an jeder Maschine die
--  Kachel „Wartung“ (Wunsch Patrick 2. November 2026). Dort legt man
--  Bilder oder PDFs ab, wählt eines aus und gibt ihm einen Termin.
--  Ab dem Termin zeigt das Pad dieses Bild oder PDF als
--  Bildschirmschoner statt des Einrichtblatts, bis jemand unten in der
--  Mitte auf „Erledigt“ tippt.
--
--  Was das Skript macht:
--   - neue Tabelle pad_wartungen (Maschine, Titel, Datei, Termin,
--     wann und von wem zuletzt erledigt)
--   - lesen und quittieren dürfen alle Angemeldeten ausser Externen
--   - hochladen, terminieren und löschen alle mit Schreibrecht
--   - wer quittiert, schreibt die Datenbank selbst dazu
--  Die Dateien liegen in der Ablage „zeichnungen“ unter
--  „maschinen/<Maschine>/wartung-pad/“.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.pad_wartungen (
  id           uuid primary key default gen_random_uuid(),
  machine_id   uuid not null references public.machines(id) on delete cascade,
  titel        text not null,
  url          text not null,
  pfad         text,
  dateiname    text,
  art          text not null default 'bild',
  termin       timestamptz,
  erledigt_am  timestamptz,
  erledigt_von uuid,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
create index if not exists pad_wartungen_maschine on public.pad_wartungen (machine_id);

alter table public.pad_wartungen enable row level security;
grant select, insert, update, delete on public.pad_wartungen to authenticated;

-- Wer quittiert, setzt die Datenbank, nicht die App
create or replace function public.pad_wartungen_erledigt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.erledigt_am is distinct from old.erledigt_am and new.erledigt_am is not null then
    new.erledigt_von := auth.uid();
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pad_wartungen_erledigt') then
    create trigger pad_wartungen_erledigt before update on public.pad_wartungen
      for each row execute function public.pad_wartungen_erledigt();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'pad_wartungen' and policyname = 'wartung lesen') then
    create policy "wartung lesen" on public.pad_wartungen for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'pad_wartungen' and policyname = 'wartung anlegen') then
    create policy "wartung anlegen" on public.pad_wartungen for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  -- Quittieren darf jeder, der sie sieht (auch Mitarbeiter am Pad)
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'pad_wartungen' and policyname = 'wartung aendern') then
    create policy "wartung aendern" on public.pad_wartungen for update to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()))
      with check ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'pad_wartungen' and policyname = 'wartung loeschen') then
    create policy "wartung loeschen" on public.pad_wartungen for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle pad_wartungen' as punkt,
       case when to_regclass('public.pad_wartungen') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (4)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename = 'pad_wartungen') >= 4 then 'ok' else 'FEHLT' end
union all
select 'Auslöser erledigt',
       case when exists (select 1 from pg_trigger where tgname = 'pad_wartungen_erledigt') then 'ok' else 'FEHLT' end;
