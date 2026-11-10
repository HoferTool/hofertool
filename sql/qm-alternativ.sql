-- QM alternativ (Wunsch Patrick 10. November 2026: „neuer Reiter QM
-- alternativ … unternehmensbezogenes QM-System, mindestens für eine
-- Zertifizierung, ISO 9001:2026 kompatibel, praxisbezogen“)
--
-- Was diese Datei tut:
--   1. Tabelle qma_texte: das schlanke Handbuch. Je Abschnitt (Geltungs-
--      bereich, Politik, Kontext …) und je Prozess eine Zeile mit Text und
--      einzelnen Feldern (Zweck, Wer, Ablauf, Nachweis, Kennzahl).
--   2. Tabelle qma_eintraege: alle Listen des QM in einer Tabelle, je
--      Zeile eine Art: abweichung, ziel, risiko, pruefmittel, lieferant,
--      schulung, audit, bewertung. Die Felder stehen in "daten", das
--      Fälligkeitsdatum rechnet die App und legt es in "faellig".
--   3. Lesen und schreiben nur mit qm_darf() (Vermerk qmSehen, nicht
--      extern), dieselbe Funktion wie beim Reiter QM.
-- Inhalte stehen nur in der Datenbank, nie im Repository.
-- Gefahrlos mehrfach ausführbar, ohne „drop“.

create table if not exists public.qma_texte (
  schluessel text primary key,              -- etwa politik, prozess:fertigung
  gruppe text,                              -- handbuch | fuehrung | kern | unterstuetzung
  titel text,
  norm text,                                -- Kapitel ISO 9001
  inhalt text,
  felder jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);

create table if not exists public.qma_eintraege (
  id uuid primary key default gen_random_uuid(),
  art text not null,
  nr integer,
  titel text not null default '',
  status text,
  faellig date,
  daten jsonb not null default '{}'::jsonb,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create index if not exists qma_eintraege_art on public.qma_eintraege (art);

alter table public.qma_texte enable row level security;
alter table public.qma_eintraege enable row level security;
grant select, insert, update, delete on public.qma_texte, public.qma_eintraege to authenticated;

do $$
declare t text;
begin
  foreach t in array array['qma_texte', 'qma_eintraege'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = t and policyname = 'qma nur mit vermerk') then
      execute format('create policy "qma nur mit vermerk" on public.%I for all to authenticated
        using ((select public.qm_darf())) with check ((select public.qm_darf()))', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabellen (2)' as punkt,
       case when to_regclass('public.qma_texte') is not null
             and to_regclass('public.qma_eintraege') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (2)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename like 'qma\_%' and policyname = 'qma nur mit vermerk') >= 2 then 'ok' else 'FEHLT' end;
