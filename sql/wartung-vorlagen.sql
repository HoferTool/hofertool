-- =================================================================
--  WARTUNGSVORLAGEN IN DEN EINSTELLUNGEN
--
--  Ab 1.353.0 lassen sich Bilder und PDFs für die Wartung als Vorlagen
--  unter Einstellungen → Wartung ablegen, gegliedert nur in
--  Langdreher, Kurzdreher und Extern (Wunsch Patrick 3. November 2026).
--  An jeder Maschine wählt man eine Vorlage und teilt sie wie bisher
--  zu: nur diese Maschine, ganzer Park oder Maschinentyp. Die Datei
--  bleibt dieselbe, der Termin gehört zur Zuteilung (wartung_plan).
--
--  Was das Skript macht:
--   - neue Tabelle wartung_vorlagen (Gruppe, Titel, Datei)
--   - lesen alle ausser Externen, anlegen, ändern, löschen alle mit
--     Schreibrecht ausser Externen (wie wartung_plan)
--
--  Läuft gefahrlos mehrfach, nichts wird gelöscht. Am Ende eine Probe.
-- =================================================================

create table if not exists public.wartung_vorlagen (
  id           uuid primary key default gen_random_uuid(),
  gruppe       text not null default 'langdreher'
               check (gruppe in ('langdreher', 'kurzdreher', 'extern')),
  titel        text not null,
  url          text not null,
  pfad         text,
  dateiname    text,
  art          text not null default 'bild',
  sort_order   int not null default 0,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
create index if not exists wartung_vorlagen_gruppe on public.wartung_vorlagen (gruppe);

alter table public.wartung_vorlagen enable row level security;
grant select, insert, update, delete on public.wartung_vorlagen to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'wartung_vorlagen' and policyname = 'vorlage lesen') then
    create policy "vorlage lesen" on public.wartung_vorlagen for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'wartung_vorlagen' and policyname = 'vorlage anlegen') then
    create policy "vorlage anlegen" on public.wartung_vorlagen for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'wartung_vorlagen' and policyname = 'vorlage aendern') then
    create policy "vorlage aendern" on public.wartung_vorlagen for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'wartung_vorlagen' and policyname = 'vorlage loeschen') then
    create policy "vorlage loeschen" on public.wartung_vorlagen for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle wartung_vorlagen' as punkt,
       case when to_regclass('public.wartung_vorlagen') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (4)',
       case when (select count(*) from pg_policies where tablename = 'wartung_vorlagen') >= 4
         then 'ok' else 'FEHLT' end;
