-- =================================================================
--  PRÜFMITTEL (provisorisch, Wunsch Patrick 15. November 2026)
--  Bisher lief das über Gewatec. Jedes Prüfmittel (Lehrdorn, Gewinde-
--  lehre, Prüfstift, Messschieber …) mit Nr., Bezeichnung und Mass, und
--  vor allem: wo es gerade ist (Prüfmittelschrank, an einer Maschine,
--  bei einer Person, extern zur Kalibrierung). Jede Ortsänderung schreibt
--  die Datenbank selbst in den Verlauf.
--  Vorerst sehen und ändern nur Admins.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

create table if not exists public.pruefmittel (
  id uuid primary key default gen_random_uuid(),
  nr text,
  bezeichnung text not null,
  art text,
  mass text,
  hoco text,
  ort_art text not null default 'schrank',
  machine_id uuid references public.machines(id) on delete set null,
  ort_text text,
  seit timestamptz default now(),
  intervall_monate integer,
  letzte_pruefung date,
  status text not null default 'aktiv',
  notiz text,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz,
  geaendert_von uuid
);
create index if not exists pruefmittel_machine on public.pruefmittel (machine_id);

create table if not exists public.pruefmittel_verlauf (
  id uuid primary key default gen_random_uuid(),
  pruefmittel_id uuid not null references public.pruefmittel(id) on delete cascade,
  am timestamptz not null default now(),
  von uuid default auth.uid(),
  was text not null,
  nach text,
  notiz text
);
create index if not exists pruefmittel_verlauf_pm on public.pruefmittel_verlauf (pruefmittel_id, am desc);

alter table public.pruefmittel enable row level security;
alter table public.pruefmittel_verlauf enable row level security;

drop policy if exists "pruefmittel admin" on public.pruefmittel;
create policy "pruefmittel admin" on public.pruefmittel for all to authenticated
  using ((select bin_admin())) with check ((select bin_admin()));
drop policy if exists "pruefmittel verlauf admin" on public.pruefmittel_verlauf;
create policy "pruefmittel verlauf admin" on public.pruefmittel_verlauf for all to authenticated
  using ((select bin_admin())) with check ((select bin_admin()));

-- Text, wo das Prüfmittel steht, für den Verlauf
create or replace function public.pruefmittel_ort_text(p public.pruefmittel)
returns text language sql stable security definer set search_path = public as $$
  select case p.ort_art
    when 'schrank' then 'Prüfmittelschrank' || coalesce(' · ' || nullif(p.ort_text, ''), '')
    when 'maschine' then 'Maschine ' || coalesce((select trim(m.name || ' ' || coalesce(m.machine_number, ''))
      from public.machines m where m.id = p.machine_id), '?') || coalesce(' · ' || nullif(p.ort_text, ''), '')
    when 'person' then 'Bei ' || coalesce(nullif(p.ort_text, ''), '?')
    when 'extern' then 'Extern' || coalesce(' · ' || nullif(p.ort_text, ''), '')
    else coalesce(p.ort_text, p.ort_art) end;
$$;

create or replace function public.pruefmittel_auf_verlauf()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pruefmittel_verlauf (pruefmittel_id, was, nach)
      values (new.id, 'erfasst', public.pruefmittel_ort_text(new));
    return new;
  end if;
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  if new.ort_art is distinct from old.ort_art or new.machine_id is distinct from old.machine_id
     or new.ort_text is distinct from old.ort_text then
    new.seit := now();
    insert into public.pruefmittel_verlauf (pruefmittel_id, was, nach)
      values (new.id, case when new.ort_art = 'schrank' then 'zurück' else 'ausgetragen' end,
              public.pruefmittel_ort_text(new));
  end if;
  if new.letzte_pruefung is distinct from old.letzte_pruefung and new.letzte_pruefung is not null then
    insert into public.pruefmittel_verlauf (pruefmittel_id, was, nach)
      values (new.id, 'geprüft', to_char(new.letzte_pruefung, 'DD.MM.YYYY'));
  end if;
  if new.status is distinct from old.status then
    insert into public.pruefmittel_verlauf (pruefmittel_id, was, nach) values (new.id, 'status', new.status);
  end if;
  return new;
end $$;

drop trigger if exists pruefmittel_verlauf_ins on public.pruefmittel;
create trigger pruefmittel_verlauf_ins after insert on public.pruefmittel
  for each row execute function public.pruefmittel_auf_verlauf();
drop trigger if exists pruefmittel_verlauf_upd on public.pruefmittel;
create trigger pruefmittel_verlauf_upd before update on public.pruefmittel
  for each row execute function public.pruefmittel_auf_verlauf();

notify pgrst, 'reload schema';

select case when to_regclass('public.pruefmittel') is not null
  and to_regclass('public.pruefmittel_verlauf') is not null then 'ok' else 'FEHLT' end as probe;
