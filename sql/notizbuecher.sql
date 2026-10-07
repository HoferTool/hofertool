-- =================================================================
--  NOTIZBÜCHER (ähnlich wie OneNote)
--
--  Auf der Startseite gibt es neben den Notizen einen Knopf mit einem
--  Buch. Er öffnet die Notizbücher: Jedes Buch hat Seiten, auf denen
--  man zeichnen, Text schreiben und Bilder oder PDFs einfügen kann.
--
--  Was das Skript macht:
--  1. Tabelle notizbuecher: die Bücher (Name, Farbe, Reihenfolge).
--  2. Tabelle notizbuch_seiten: die Seiten eines Buchs. Was auf der
--     Seite steht (Striche, Textfelder, Bilder), liegt als Liste in
--     der Spalte inhalt. Wird ein Buch gelöscht, gehen seine Seiten mit.
--  3. Ablage "notizbuecher" für eingefügte Bilder und PDFs.
--  4. Lesen und Schreiben dürfen alle Angemeldeten ausser Externen
--     (wie bei den Notizen: jeder darf alles bearbeiten).
--
--  Läuft gefahrlos mehrfach. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

-- ---------- 1. Bücher ----------
create table if not exists public.notizbuecher (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'Notizbuch',
  farbe         text not null default '#1f5fbf',
  reihenfolge   integer not null default 0,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now()
);

-- ---------- 2. Seiten ----------
create table if not exists public.notizbuch_seiten (
  id            uuid primary key default gen_random_uuid(),
  buch_id       uuid not null references public.notizbuecher (id) on delete cascade,
  titel         text not null default '',
  reihenfolge   integer not null default 0,
  inhalt        jsonb not null default '[]'::jsonb,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create index if not exists notizbuch_seiten_buch on public.notizbuch_seiten (buch_id, reihenfolge);

-- ---------- 4. Wer darf was ----------
alter table public.notizbuecher enable row level security;
alter table public.notizbuch_seiten enable row level security;

drop policy if exists "notizbuecher alle" on public.notizbuecher;
create policy "notizbuecher alle" on public.notizbuecher
  for all to authenticated using (not public.ist_extern()) with check (not public.ist_extern());

-- Ist sql/notizbuch-passwort.sql schon ausgeführt, bleibt dessen Sperre
-- erhalten (sonst würde ein zweites Ausführen dieser Datei sie aufheben)
drop policy if exists "notizbuch seiten alle" on public.notizbuch_seiten;
do $$
begin
  if to_regprocedure('public.notizbuch_frei(uuid)') is not null then
    execute 'create policy "notizbuch seiten alle" on public.notizbuch_seiten for all to authenticated '
         || 'using (not public.ist_extern() and public.notizbuch_frei(buch_id)) '
         || 'with check (not public.ist_extern() and public.notizbuch_frei(buch_id))';
  else
    execute 'create policy "notizbuch seiten alle" on public.notizbuch_seiten for all to authenticated '
         || 'using (not public.ist_extern()) with check (not public.ist_extern())';
  end if;
end $$;

grant select, insert, update, delete on public.notizbuecher to authenticated;
grant select, insert, update, delete on public.notizbuch_seiten to authenticated;

-- ---------- 3. Ablage für Bilder und PDFs ----------
-- Öffentlich lesbar wie die Zeichnungen: Die Dateinamen sind zufällig
-- und lassen sich nicht erraten.
insert into storage.buckets (id, name, public)
values ('notizbuecher', 'notizbuecher', true)
on conflict (id) do update set public = true;

drop policy if exists "notizbuecher lesen" on storage.objects;
create policy "notizbuecher lesen" on storage.objects
  for select using (bucket_id = 'notizbuecher');

drop policy if exists "notizbuecher hochladen" on storage.objects;
create policy "notizbuecher hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notizbuecher' and not public.ist_extern());

drop policy if exists "notizbuecher loeschen" on storage.objects;
create policy "notizbuecher loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'notizbuecher' and not public.ist_extern());

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle notizbuecher' as punkt,
       case when to_regclass('public.notizbuecher') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Tabelle notizbuch_seiten',
       case when to_regclass('public.notizbuch_seiten') is not null then 'ok' else 'FEHLT' end
union all
select 'Ablage notizbuecher',
       case when exists (select 1 from storage.buckets where id = 'notizbuecher') then 'ok' else 'FEHLT' end
union all
select 'Regeln',
       case when (select count(*) from pg_policies where policyname in
         ('notizbuecher alle', 'notizbuch seiten alle', 'notizbuecher lesen', 'notizbuecher hochladen')) = 4
       then 'ok' else 'FEHLT' end;
