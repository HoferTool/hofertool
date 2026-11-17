-- =================================================================
--  HOFER2DTO3D: STEP-Modell ohne Hochladen durch Patrick
--
--  Wunsch Patrick 17. November 2026: „warum muss ich das STEP hochladen,
--  du machst es ja, aus dem PDF“.
--
--  Was das Skript macht:
--   - zeichnung_3d bekommt eine Spalte status: „offen“ (nur PDF, das
--     3D-Modell wird noch gebaut) oder „fertig“ (STEP ist da)
--   - neue Tabelle zeichnung_3d_step: das von Claude gebaute STEP-Modell
--     direkt in der Datenbank, mit gzip gepackt und als Base64-Text
--     (Claude kommt ohne Anmeldung nicht in die Ablage, aber über die
--     Datenbank-Verbindung); die App packt es beim Ansehen und
--     Herunterladen wieder aus
--   - lesen wie zeichnung_3d (alle ausser Externen und Dienst), ändern
--     mit Schreibrecht ausser Externen
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe.
-- =================================================================

alter table public.zeichnung_3d add column if not exists status text not null default 'offen';
update public.zeichnung_3d set status = 'fertig' where step_url is not null and status = 'offen';

create table if not exists public.zeichnung_3d_step (
  id          uuid primary key references public.zeichnung_3d (id) on delete cascade,
  name        text not null,
  groesse     bigint,
  inhalt_gz   text not null default '',
  erstellt_am timestamptz not null default now()
);

alter table public.zeichnung_3d_step enable row level security;
grant select, insert, update, delete on public.zeichnung_3d_step to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'zeichnung_3d_step' and policyname = 'zeichnung_3d_step lesen') then
    create policy "zeichnung_3d_step lesen" on public.zeichnung_3d_step for select to authenticated
      using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'zeichnung_3d_step' and policyname = 'zeichnung_3d_step schreiben') then
    create policy "zeichnung_3d_step schreiben" on public.zeichnung_3d_step for all to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte status' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'zeichnung_3d' and column_name = 'status') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Tabelle zeichnung_3d_step',
       case when to_regclass('public.zeichnung_3d_step') is not null then 'ok' else 'FEHLT' end
union all
select 'Regeln (2)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename = 'zeichnung_3d_step') >= 2 then 'ok' else 'FEHLT' end;

-- ---------- Einmalige Schlüssel für die Server-Funktion step-ablegen ----------
-- Claude legt per Datenbank-Verbindung einen Schlüssel an, die Funktion
-- prüft und löscht ihn. Keine Regeln: niemand ausser dem Server liest sie.
create table if not exists public.zeichnung_3d_upload (
  schluessel  text primary key,
  eintrag     uuid not null references public.zeichnung_3d (id) on delete cascade,
  gueltig_bis timestamptz not null default now() + interval '1 hour'
);
alter table public.zeichnung_3d_upload enable row level security;
revoke all on public.zeichnung_3d_upload from anon, authenticated;

select 'Tabelle zeichnung_3d_upload' as punkt,
       case when to_regclass('public.zeichnung_3d_upload') is not null then 'ok' else 'FEHLT' end as ergebnis;
