-- =================================================================
--  PRÜFBERICHTE (1.770.0, Wunsch Patrick 24. November 2026: „alle
--  Berichte per Pfad hochladen und daraus ein Prüfprotokoll machen, das
--  per Tool läuft und ähnlich aufgebaut ist“, „unter QS als weiterer
--  Reiter Prüfberichte“)
--
--    pruefbericht_dateien  die Excel-Prüfberichte je HOCO Nr. (eine
--                          Zeile je Datei, Seite 1/2, 2/2 …). Kommen
--                          vom Pool-Rechner (pruefberichte.ps1, liest
--                          die Ordner nur) oder von Hand in der App.
--    pruefprotokolle       die in der App ausgefüllten Protokolle je
--                          HOCO Nr. und FA: Ist-Werte, Prüf-Entscheid,
--                          Datum und Visum.
--    app_config pruefbericht_ordner / pruefbericht_status
--
--  Lesen: alle, die lesen dürfen, ausser Externen. Ändern: wer
--  Schreibrecht hat (nicht Externe), dazu das Dienstkonto für die Dateien.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.pruefbericht_dateien (
  id           uuid primary key default gen_random_uuid(),
  hoco_nr      text not null,
  name         text not null,
  pfad         text,
  url          text not null,
  ablage       text,
  seite        int,
  kennung      text,
  quelle       text not null default 'hand',
  geaendert    timestamptz,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
create index if not exists pruefbericht_dateien_hoco on public.pruefbericht_dateien (hoco_nr);
alter table public.pruefbericht_dateien enable row level security;

create table if not exists public.pruefprotokolle (
  id            uuid primary key default gen_random_uuid(),
  hoco_nr       text not null,
  fa_nr         text,
  job_id        uuid,
  kopf          jsonb not null default '{}'::jsonb,
  werte         jsonb not null default '{}'::jsonb,
  entscheid     text,
  visum         text,
  datum         date,
  bemerkung     text,
  abgeschlossen_am timestamptz,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create index if not exists pruefprotokolle_hoco on public.pruefprotokolle (hoco_nr);
alter table public.pruefprotokolle enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'pruefbericht_dateien' and policyname = 'lesen') then
    create policy "lesen" on public.pruefbericht_dateien for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pruefbericht_dateien' and policyname = 'schreiben') then
    create policy "schreiben" on public.pruefbericht_dateien for all to authenticated
      using ((select public.bin_dienst()) or ((select public.darf_schreiben()) and not (select public.ist_extern())))
      with check ((select public.bin_dienst()) or ((select public.darf_schreiben()) and not (select public.ist_extern())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pruefprotokolle' and policyname = 'lesen') then
    create policy "lesen" on public.pruefprotokolle for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pruefprotokolle' and policyname = 'schreiben') then
    create policy "schreiben" on public.pruefprotokolle for all to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'app_config' and policyname = 'dienst meldet pruefberichte') then
    create policy "dienst meldet pruefberichte" on public.app_config for all to authenticated
      using (schluessel = 'pruefbericht_status' and (select public.bin_dienst()))
      with check (schluessel = 'pruefbericht_status' and (select public.bin_dienst()));
  end if;
end $$;

-- Wer und wann geändert, setzt die Datenbank
create or replace function public.pruefprotokoll_stempel() returns trigger
language plpgsql as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'pruefprotokoll_stempel') then
    create trigger pruefprotokoll_stempel before update on public.pruefprotokolle
      for each row execute function public.pruefprotokoll_stempel();
  end if;
end $$;

grant select, insert, update, delete on public.pruefbericht_dateien to authenticated;
grant select, insert, update, delete on public.pruefprotokolle to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle pruefbericht_dateien' as was,
       case when exists (select 1 from pg_policies where tablename = 'pruefbericht_dateien' and policyname = 'schreiben')
            then 'ok' else 'FEHLT' end as stand
union all select 'Tabelle pruefprotokolle',
       case when exists (select 1 from pg_policies where tablename = 'pruefprotokolle' and policyname = 'schreiben')
            then 'ok' else 'FEHLT' end
union all select 'Stand melden',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'dienst meldet pruefberichte') then 'ok' else 'FEHLT' end;
