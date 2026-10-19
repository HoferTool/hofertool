-- =================================================================
--  NOTIZBÜCHER MIT ABSCHNITTEN (wie OneNote)
--
--  Wunsch Patrick 19. Oktober 2026: „Notizbücher sollen die gleiche
--  Struktur haben wie OneNote, mit Seiten und Abschnitten. Alles, was
--  jetzt schon drin ist: Abschnitt als Titel nehmen und die vorhandenen
--  Seiten als Seiten sein lassen.“
--
--  Was das Skript macht:
--   1. Neue Tabelle notizbuch_abschnitte: Abschnitte eines Buchs mit
--      Name, Farbe und Reihenfolge. Wer ein gesperrtes Buch nicht
--      geöffnet hat, sieht auch seine Abschnitte nicht (wie die Seiten).
--      Nicht für Externe.
--   2. Jede Seite bekommt die Spalte abschnitt_id.
--   3. Jedes Buch ohne Abschnitt bekommt einen Abschnitt mit dem Namen
--      des Buchs, und alle seine Seiten kommen dort hinein.
--   4. Funktion notizbuch_pad_abschnitte: Abschnitte eines Buchs im
--      Pad Mode zum Lesen, wenn das Buch dem Park zugewiesen ist (wie
--      notizbuch_pad_seiten).
--
--  Ohne drop, läuft gefahrlos mehrfach. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

-- ---------- 1. Abschnitte ----------
create table if not exists public.notizbuch_abschnitte (
  id            uuid primary key default gen_random_uuid(),
  buch_id       uuid not null references public.notizbuecher (id) on delete cascade,
  name          text not null default '',
  farbe         text,
  reihenfolge   integer not null default 0,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now()
);
create index if not exists notizbuch_abschnitte_buch on public.notizbuch_abschnitte (buch_id, reihenfolge);

alter table public.notizbuch_abschnitte enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'notizbuch_abschnitte' and policyname = 'notizbuch abschnitte alle') then
    if to_regprocedure('public.notizbuch_frei(uuid)') is not null then
      execute 'create policy "notizbuch abschnitte alle" on public.notizbuch_abschnitte for all to authenticated '
           || 'using (not public.ist_extern() and public.notizbuch_frei(buch_id)) '
           || 'with check (not public.ist_extern() and public.notizbuch_frei(buch_id))';
    else
      execute 'create policy "notizbuch abschnitte alle" on public.notizbuch_abschnitte for all to authenticated '
           || 'using (not public.ist_extern()) with check (not public.ist_extern())';
    end if;
  end if;
end $$;
grant select, insert, update, delete on public.notizbuch_abschnitte to authenticated;

-- ---------- 2. Seite gehört zu einem Abschnitt ----------
-- Löscht man den Abschnitt, gehen seine Seiten mit (wie in OneNote)
alter table public.notizbuch_seiten
  add column if not exists abschnitt_id uuid references public.notizbuch_abschnitte (id) on delete cascade;
create index if not exists notizbuch_seiten_abschnitt on public.notizbuch_seiten (abschnitt_id, reihenfolge);

-- ---------- 3. Bestehendes: ein Abschnitt je Buch mit dem Namen des Buchs ----------
insert into public.notizbuch_abschnitte (buch_id, name, farbe, reihenfolge, erstellt_von)
select b.id, b.name, b.farbe, 1, b.erstellt_von
from public.notizbuecher b
where not exists (select 1 from public.notizbuch_abschnitte a where a.buch_id = b.id);

update public.notizbuch_seiten s
set abschnitt_id = (select a.id from public.notizbuch_abschnitte a where a.buch_id = s.buch_id
                    order by a.reihenfolge, a.erstellt_am limit 1)
where s.abschnitt_id is null;

-- ---------- 4. Pad Mode: Abschnitte lesen ohne Passwort ----------
create or replace function public.notizbuch_pad_abschnitte(p_buch uuid, p_park uuid)
returns table (id uuid, buch_id uuid, name text, farbe text, reihenfolge integer, erstellt_am timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.id, a.buch_id, a.name, a.farbe, a.reihenfolge, a.erstellt_am
  from public.notizbuch_abschnitte a
  join public.notizbuecher b on b.id = a.buch_id
  where a.buch_id = p_buch
    and p_park = any (b.parks)
    and auth.uid() is not null
    and not public.ist_extern()
  order by a.reihenfolge, a.erstellt_am;
$$;
revoke all on function public.notizbuch_pad_abschnitte(uuid, uuid) from public, anon;
grant execute on function public.notizbuch_pad_abschnitte(uuid, uuid) to authenticated;

-- Seiten im Pad Mode mit ihrem Abschnitt (die alte Funktion
-- notizbuch_pad_seiten bleibt für ältere Fassungen der App)
create or replace function public.notizbuch_pad_seiten_ab(p_buch uuid, p_park uuid)
returns table (id uuid, buch_id uuid, abschnitt_id uuid, titel text, reihenfolge integer, inhalt jsonb,
               erstellt_am timestamptz, geaendert_am timestamptz)
language sql stable security definer set search_path = public
as $$
  select s.id, s.buch_id, s.abschnitt_id, s.titel, s.reihenfolge, s.inhalt, s.erstellt_am, s.geaendert_am
  from public.notizbuch_seiten s
  join public.notizbuecher b on b.id = s.buch_id
  where s.buch_id = p_buch
    and p_park = any (b.parks)
    and auth.uid() is not null
    and not public.ist_extern()
  order by s.reihenfolge, s.erstellt_am;
$$;
revoke all on function public.notizbuch_pad_seiten_ab(uuid, uuid) from public, anon;
grant execute on function public.notizbuch_pad_seiten_ab(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle notizbuch_abschnitte' as punkt,
       case when to_regclass('public.notizbuch_abschnitte') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Spalte notizbuch_seiten.abschnitt_id',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'notizbuch_seiten' and column_name = 'abschnitt_id') then 'ok' else 'FEHLT' end
union all
select 'Jede Seite hat einen Abschnitt',
       case when not exists (select 1 from public.notizbuch_seiten where abschnitt_id is null) then 'ok' else 'FEHLT' end
union all
select 'Funktionen Pad Mode',
       case when to_regprocedure('public.notizbuch_pad_abschnitte(uuid, uuid)') is not null
             and to_regprocedure('public.notizbuch_pad_seiten_ab(uuid, uuid)') is not null then 'ok' else 'FEHLT' end;
