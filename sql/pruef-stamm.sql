-- =================================================================
--  PRÜFUNG IN DEN STAMMDATEN DER HOCO NR. (1.779.0, Wunsch Patrick
--  24. November 2026: „was wo gemacht werden muss, wird bei Stammdaten
--  definiert“, „Excel-Berichte hochladen nur per Stammdaten, neue sollen
--  dort gleich ausgefüllt werden“)
--
--    pruef_stamm  je HOCO Nr. eine Zeile:
--                 arten   welche Protokolle nötig sind, z. B.
--                         ["erstteil","aql","ll"]
--                 aql, niveau   Vorgabe für die AQL-Stichprobe
--                 zeilen  die Masse (Nr., Soll, Prüfmittel, Abschnitte)
--                 kopf    Artikel, Zeichnung, Index … aus dem Excel
--
--  Lesen: alle, die lesen dürfen, ausser Externen. Ändern: wer
--  Schreibrecht hat, nicht Externe.
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.pruef_stamm (
  hoco_nr       text primary key,
  arten         jsonb not null default '[]'::jsonb,
  aql           numeric,
  niveau        text,
  zeilen        jsonb not null default '[]'::jsonb,
  kopf          jsonb not null default '{}'::jsonb,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
alter table public.pruef_stamm enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'pruef_stamm' and policyname = 'lesen') then
    create policy "lesen" on public.pruef_stamm for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pruef_stamm' and policyname = 'schreiben') then
    create policy "schreiben" on public.pruef_stamm for all to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'pruef_stamm_stempel') then
    create trigger pruef_stamm_stempel before update on public.pruef_stamm
      for each row execute function public.pruefprotokoll_stempel();
  end if;
end $$;

grant select, insert, update, delete on public.pruef_stamm to authenticated;

notify pgrst, 'reload schema';

select 'Tabelle pruef_stamm' as was,
       case when exists (select 1 from pg_policies where tablename = 'pruef_stamm' and policyname = 'schreiben')
            then 'ok' else 'FEHLT' end as stand;
