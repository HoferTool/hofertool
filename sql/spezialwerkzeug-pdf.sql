-- =================================================================
--  SPEZIALWERKZEUGE: PDF HINTERLEGEN
--
--  Zu jedem Spezialwerkzeug (Artikel) lassen sich PDFs hinterlegen,
--  etwa eine Zeichnung oder ein Datenblatt (Wunsch Patrick
--  30. Oktober 2026: „Bei den Spezialwerkzeugen sollen PDF hinterlegt
--  werden können“). Die Datei liegt in der Ablage „zeichnungen“ unter
--  spezialwerkzeuge/, hier steht nur, zu welchem Artikel sie gehört.
--
--  Was das Skript macht:
--   - neue Tabelle spezial_pdfs: Artikel, Name, Adresse der Datei,
--     wer und wann
--   - lesen alle ausser Externen; hinterlegen und löschen alle mit
--     Schreibrecht (wie bei den Spezialwerkzeugen)
--   - löscht man einen Artikel, verschwinden seine PDFs mit
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.spezial_pdfs (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid not null references public.articles(id) on delete cascade,
  name         text not null,
  url          text not null,
  pfad         text,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
create index if not exists spezial_pdfs_artikel on public.spezial_pdfs (article_id);

alter table public.spezial_pdfs enable row level security;
grant select, insert, update, delete on public.spezial_pdfs to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'spezial_pdfs' and policyname = 'spezial pdf lesen') then
    create policy "spezial pdf lesen" on public.spezial_pdfs for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'spezial_pdfs' and policyname = 'spezial pdf anlegen') then
    create policy "spezial pdf anlegen" on public.spezial_pdfs for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'spezial_pdfs' and policyname = 'spezial pdf aendern') then
    create policy "spezial pdf aendern" on public.spezial_pdfs for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'spezial_pdfs' and policyname = 'spezial pdf loeschen') then
    create policy "spezial pdf loeschen" on public.spezial_pdfs for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle spezial_pdfs' as punkt,
       case when to_regclass('public.spezial_pdfs') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (4)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename = 'spezial_pdfs') >= 4 then 'ok' else 'FEHLT' end;
