-- =================================================================
--  EINRICHTBLATT: BILD AM ARTIKEL (1.43.0, Test)
--
--  Was das tut, in einfachen Worten:
--  Die Bilder auf dem Einrichtblatt lädt man in der App hoch. Wählt
--  jemand auf einem Blatt zu einem Artikel ein Bild, merkt sich die App
--  das hier. Braucht später irgendwer auf irgendeinem Typ denselben
--  Artikel, kommt das Bild von selbst dazu (Wunsch Patrick, 13. und
--  15. Oktober 2026).
--
--  Tabelle artikel_bild: eine Zeile je Artikel, bild = „eigen:<id>“.
--  Die Artikel selbst bleiben unverändert.
--
--  Tabelle eb_spezial: Spezialwerkzeuge. Sie füllen einen Platz wie ein
--  Artikel, sind aber kein Artikel und erscheinen nicht beim Bestellen.
--  Auch sie merken sich ihr Bild.
--
--  Tabelle eb_bilder: eigene Bilder, die man in der App zur Bibliothek
--  hochlädt (Datei in der Ablage „zeichnungen“, einrichtblatt/bilder/).
--  Lesen dürfen alle Angemeldeten, ändern alle ausser Externen.
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.artikel_bild (
  article_id    uuid primary key references public.articles (id) on delete cascade,
  bild          text not null,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid() references public.profiles (id) on delete set null
);

create or replace function public.artikel_bild_geaendert()
returns trigger language plpgsql set search_path = public as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := coalesce(auth.uid(), new.geaendert_von);
  return new;
end $$;
drop trigger if exists artikel_bild_geaendert on public.artikel_bild;
create trigger artikel_bild_geaendert before update on public.artikel_bild
  for each row execute function public.artikel_bild_geaendert();

alter table public.artikel_bild enable row level security;
drop policy if exists "lesen" on public.artikel_bild;
create policy "lesen" on public.artikel_bild for select to authenticated using (public.darf_lesen());
drop policy if exists "anlegen" on public.artikel_bild;
create policy "anlegen" on public.artikel_bild for insert to authenticated
  with check (public.darf_schreiben() and not public.ist_extern());
drop policy if exists "aendern" on public.artikel_bild;
create policy "aendern" on public.artikel_bild for update to authenticated
  using (public.darf_schreiben() and not public.ist_extern())
  with check (public.darf_schreiben() and not public.ist_extern());
drop policy if exists "loeschen" on public.artikel_bild;
create policy "loeschen" on public.artikel_bild for delete to authenticated
  using (public.darf_schreiben() and not public.ist_extern());

create table if not exists public.eb_bilder (
  id           uuid primary key default gen_random_uuid(),
  name         text,
  url          text not null,
  pfad         text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid() references public.profiles (id) on delete set null
);
alter table public.eb_bilder enable row level security;
drop policy if exists "lesen" on public.eb_bilder;
create policy "lesen" on public.eb_bilder for select to authenticated using (public.darf_lesen());
drop policy if exists "anlegen" on public.eb_bilder;
create policy "anlegen" on public.eb_bilder for insert to authenticated
  with check (public.darf_schreiben() and not public.ist_extern());
drop policy if exists "loeschen" on public.eb_bilder;
create policy "loeschen" on public.eb_bilder for delete to authenticated
  using (public.darf_schreiben() and not public.ist_extern());

create table if not exists public.eb_spezial (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  hersteller   text,
  bild         text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid() references public.profiles (id) on delete set null
);
alter table public.eb_spezial enable row level security;
drop policy if exists "lesen" on public.eb_spezial;
create policy "lesen" on public.eb_spezial for select to authenticated using (public.darf_lesen());
drop policy if exists "anlegen" on public.eb_spezial;
create policy "anlegen" on public.eb_spezial for insert to authenticated
  with check (public.darf_schreiben() and not public.ist_extern());
drop policy if exists "aendern" on public.eb_spezial;
create policy "aendern" on public.eb_spezial for update to authenticated
  using (public.darf_schreiben() and not public.ist_extern())
  with check (public.darf_schreiben() and not public.ist_extern());
drop policy if exists "loeschen" on public.eb_spezial;
create policy "loeschen" on public.eb_spezial for delete to authenticated
  using (public.darf_schreiben() and not public.ist_extern());

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle artikel_bild' as punkt,
       case when to_regclass('public.artikel_bild') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Tabelle eb_bilder',
       case when to_regclass('public.eb_bilder') is not null then 'ok' else 'FEHLT' end
union all
select 'Tabelle eb_spezial',
       case when to_regclass('public.eb_spezial') is not null then 'ok' else 'FEHLT' end;
