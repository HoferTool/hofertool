-- =================================================================
--  SPEZIALWERKZEUGE
--
--  Spezialwerkzeuge sind ganz normale Artikel der Bestellungen (mit
--  Artikelnummer, Bezeichnung und Lieferant). Neu kann man sie einer
--  oder mehreren HOCO Nummern zuordnen, etwa 10007-0440 (Wunsch Patrick
--  21. Oktober 2026). So sieht man im Auftrag auf der Planwand und im
--  Pad Mode, welche Spezialwerkzeuge ein Teil braucht, und kann sie
--  mit einem Tipp nachbestellen.
--
--  Was das Skript macht:
--   - neue Tabelle spezialwerkzeuge: welcher Artikel zu welcher HOCO Nr.
--     gehört, mit Notiz, wer und wann
--   - lesen alle ausser Externen; zuordnen und entfernen alle, die
--     Bestellungen anlegen dürfen (wie bei den Artikeln)
--   - löscht man einen Artikel, verschwinden seine Zuordnungen mit
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.spezialwerkzeuge (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid not null references public.articles(id) on delete cascade,
  hoco_nr      text not null,
  notiz        text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  constraint spezialwerkzeuge_einmal unique (article_id, hoco_nr)
);
create index if not exists spezialwerkzeuge_hoco on public.spezialwerkzeuge (hoco_nr);

alter table public.spezialwerkzeuge enable row level security;
grant select, insert, update, delete on public.spezialwerkzeuge to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“, damit das Skript
-- auch über die Supabase-Verbindung ohne Rückfrage läuft)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'spezialwerkzeuge' and policyname = 'spezial lesen') then
    create policy "spezial lesen" on public.spezialwerkzeuge for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'spezialwerkzeuge' and policyname = 'spezial anlegen') then
    create policy "spezial anlegen" on public.spezialwerkzeuge for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'spezialwerkzeuge' and policyname = 'spezial aendern') then
    create policy "spezial aendern" on public.spezialwerkzeuge for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'spezialwerkzeuge' and policyname = 'spezial loeschen') then
    create policy "spezial loeschen" on public.spezialwerkzeuge for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle spezialwerkzeuge' as punkt,
       case when to_regclass('public.spezialwerkzeuge') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (4)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename = 'spezialwerkzeuge') >= 4 then 'ok' else 'FEHLT' end;
