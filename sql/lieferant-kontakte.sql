-- =================================================================
--  KONTAKTPERSONEN UND BESUCHE BEI DEN LIEFERANTEN
--
--  Wunsch Patrick 3. November 2026: „bei den Lieferanten die
--  Kontaktpersonen hinterlegen, am besten mit Erkennung der
--  Visitenkarte, und Notizen, wenn ein Vertreter da war, mit Datum“.
--
--  lieferant_kontakte: je Person Name, Funktion, Telefon, Mobil,
--    Mail, Notiz und wahlweise das Foto der Visitenkarte (karte_url,
--    Ablage „zeichnungen“ unter lieferanten/<id>/karten/).
--  lieferant_besuche: je Besuch Datum, wer da war (Kontakt, wahlweise)
--    und die Notiz.
--  Lesen alle Angemeldeten ausser Externen, eintragen, ändern und
--  löschen alle mit Schreibrecht ausser Externen. Löscht man den
--  Lieferanten, gehen seine Kontakte und Besuche mit.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.lieferant_kontakte (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  name          text not null,
  funktion      text,
  telefon       text,
  mobil         text,
  email         text,
  notiz         text,
  karte_url     text,
  karte_pfad    text,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz
);
create index if not exists lieferant_kontakte_lief on public.lieferant_kontakte (supplier_id);

create table if not exists public.lieferant_besuche (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  kontakt_id    uuid references public.lieferant_kontakte(id) on delete set null,
  datum         date not null default current_date,
  notiz         text not null,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz
);
create index if not exists lieferant_besuche_lief on public.lieferant_besuche (supplier_id, datum desc);

alter table public.lieferant_kontakte enable row level security;
alter table public.lieferant_besuche enable row level security;
grant select, insert, update, delete on public.lieferant_kontakte to authenticated;
grant select, insert, update, delete on public.lieferant_besuche to authenticated;

do $$
declare t text;
begin
  foreach t in array array['lieferant_kontakte', 'lieferant_besuche'] loop
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
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when (select count(*) from information_schema.tables where table_schema = 'public'
    and table_name in ('lieferant_kontakte', 'lieferant_besuche')) = 2
  and (select count(*) from pg_policies where schemaname = 'public'
    and tablename in ('lieferant_kontakte', 'lieferant_besuche')) = 8
  then 'ok' else 'FEHLT' end as lieferant_kontakte;
