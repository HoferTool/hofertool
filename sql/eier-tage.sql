-- =================================================================
--  EIERZÄHLER IM PAUSENRAUM (1.297.0)
--  Wunsch Patrick 30. Oktober 2026: „mach mir noch eine Kachel für den
--  Eierzähler, damit wir die täglich gelegten Eier eintragen können“.
--  Neue Tabelle eier_tage: je Tag eine Zeile mit der Zahl der gelegten
--  Eier, wer sie zuletzt eingetragen hat und wann. Lesen und eintragen
--  dürfen alle Angemeldeten ausser Externen (wie der alte Eierzähler).
--  Die alten Tabellen eier_zaehler und eier_historie bleiben, wie sie sind.
--  Gefahrlos mehrfach ausführbar, ohne drop.
-- =================================================================

create table if not exists public.eier_tage (
  datum date primary key,
  anzahl integer not null default 0 check (anzahl >= 0 and anzahl <= 10000),
  geaendert_von uuid default auth.uid(),
  geaendert_am timestamptz not null default now()
);

alter table public.eier_tage enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'eier_tage' and policyname = 'eier_tage lesen') then
    create policy "eier_tage lesen" on public.eier_tage for select
      using (darf_lesen() and not (select ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'eier_tage' and policyname = 'eier_tage eintragen') then
    create policy "eier_tage eintragen" on public.eier_tage for insert
      with check (darf_lesen() and not (select ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'eier_tage' and policyname = 'eier_tage aendern') then
    create policy "eier_tage aendern" on public.eier_tage for update
      using (darf_lesen() and not (select ist_extern()))
      with check (darf_lesen() and not (select ist_extern()));
  end if;
end $$;

grant select, insert, update on public.eier_tage to authenticated;

-- Wer und wann setzt die Datenbank selbst, damit kein Gerät es verfälscht
create or replace function public.eier_tage_stempel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.geaendert_von := auth.uid();
  new.geaendert_am := now();
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'eier_tage_stempel') then
    create trigger eier_tage_stempel before insert or update on public.eier_tage
      for each row execute function public.eier_tage_stempel();
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe: zeigt ok oder FEHLT
select case when exists (select 1 from information_schema.tables where table_name = 'eier_tage')
  and (select count(*) from pg_policies where tablename = 'eier_tage') >= 3
  then 'ok' else 'FEHLT' end as eier_tage;
