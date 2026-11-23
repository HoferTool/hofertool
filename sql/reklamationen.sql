-- =================================================================
--  REKLAMATIONSMANAGEMENT (Reiter der Qualitätssicherung, 1.746.0)
--
--  Wunsch Patrick 23. November 2026: „bei QS einen weiteren Reiter,
--  Reklamationsmanagement“. Je Reklamation eine Zeile: von wem
--  (Kunde, an Lieferant, intern), HOCO Nr., FA Nr., Teil, Mengen,
--  Fehlerart und Beschreibung, Stand, Verantwortlich, Termin und die
--  Schritte wie im 8D-Bericht (Sofortmassnahme, Ursache, Korrektur,
--  Vorbeugung, Wirksamkeit), Kosten, Fotos und PDFs (Liste in
--  „dateien“, Ablage „zeichnungen“ unter reklamationen/<id>/).
--  Die Nummer RKJJ-001 vergibt die Datenbank je Jahr selbst.
--  Lesen alle ausser Externen, eintragen und ändern mit Schreibrecht
--  ausser Externen. Läuft gefahrlos mehrfach. Am Ende Probe ok / FEHLT.
-- =================================================================

create table if not exists public.reklamationen (
  id              uuid primary key default gen_random_uuid(),
  nr              text unique,
  art             text not null default 'kunde',   -- kunde | lieferant | intern
  partner         text,                            -- Kunde bzw. Lieferant
  kontakt         text,
  ref_partner     text,                            -- Nummer der Reklamation beim Kunden
  eingang         date not null default current_date,
  hoco_nr         text,
  fa_nr           text,
  teil            text,
  menge_geliefert integer,
  menge_reklamiert integer,
  menge_fehler    integer,
  fehlerart       text,
  fehler          text,
  status          text not null default 'offen',   -- offen | bearbeitung | abgeschlossen | abgelehnt
  verantwortlich  text,
  termin          date,
  sofort          text,
  ursache         text,
  korrektur       text,
  vorbeugung      text,
  wirksamkeit     text,
  kosten          numeric,
  dateien         jsonb not null default '[]'::jsonb,
  abgeschlossen_am timestamptz,
  erstellt_am     timestamptz not null default now(),
  erstellt_von    uuid default auth.uid(),
  geaendert_am    timestamptz,
  geaendert_von   uuid
);
create index if not exists reklamationen_eingang on public.reklamationen (eingang desc);

create or replace function public.reklamation_nr() returns trigger
language plpgsql security definer set search_path = public as $$
declare j text; n int;
begin
  if new.nr is null or new.nr = '' then
    j := to_char(coalesce(new.eingang, current_date), 'YY');
    perform pg_advisory_xact_lock(hashtext('reklamation_nr' || j));
    select coalesce(max(substring(nr from 6)::int), 0) + 1 into n
      from public.reklamationen where nr like 'RK' || j || '-%' and substring(nr from 6) ~ '^[0-9]+$';
    new.nr := 'RK' || j || '-' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'reklamationen_nr') then
    create trigger reklamationen_nr before insert on public.reklamationen
      for each row execute function public.reklamation_nr();
  end if;
end $$;

alter table public.reklamationen enable row level security;
grant select, insert, update, delete on public.reklamationen to authenticated;
do $$
declare t text := 'reklamationen';
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ' lesen') then
    execute format('create policy %I on public.%I for select to authenticated using ((select public.darf_lesen()) and not (select public.ist_extern()))', t || ' lesen', t);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ' anlegen') then
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.darf_schreiben()) and not (select public.ist_extern()))', t || ' anlegen', t);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ' aendern') then
    execute format('create policy %I on public.%I for update to authenticated using ((select public.darf_schreiben()) and not (select public.ist_extern())) with check ((select public.darf_schreiben()) and not (select public.ist_extern()))', t || ' aendern', t);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || ' loeschen') then
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.darf_schreiben()) and not (select public.ist_extern()))', t || ' loeschen', t);
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when to_regclass('public.reklamationen') is not null
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reklamationen') = 4
  and exists (select 1 from pg_trigger where tgname = 'reklamationen_nr')
  then 'ok' else 'FEHLT' end as probe;

-- Seit 1.746.0: angekreuzte Punkte des 8D-Berichts je Schritt
-- (zum Beispiel {"d3": ["Ersatzlieferung"], "d4a": [...]}).
alter table public.reklamationen add column if not exists achtd jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
select case when exists (select 1 from information_schema.columns where table_name = 'reklamationen' and column_name = 'achtd')
  then 'ok' else 'FEHLT' end as probe_achtd;
