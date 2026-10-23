-- =================================================================
--  AUSSCHUSS FÜR DIE STATISTIK (1.159.0, Wunsch Patrick 23. Oktober 2026)
--  Die Meldungen der Qualitätssicherung (qs_meldungen) verschwinden
--  beim Quittieren. Für die Statistik braucht es aber alle Mengen.
--  Diese Datei
--    1. legt die Tabelle qs_ausschuss an: jede Meldung bleibt dort,
--       auch nach dem Quittieren, mit Zeitpunkt des Quittierens
--    2. gibt qs_meldungen die Spalte quittiert_am: die App setzt sie
--       kurz vor dem Löschen, so weiss die Datenbank, dass quittiert
--       und nicht eine falsche Meldung mit Rückgängig weggenommen wurde
--    3. ein Auslöser hält qs_ausschuss nach: neue Meldung → neue Zeile,
--       geändert → nachgeführt, gelöscht ohne Quittieren (Rückgängig)
--       → Zeile weg, Rückgängig nach dem Quittieren → wieder offen
--    4. übernimmt die Meldungen, die gerade offen sind
--  Lesen alle ausser Externen, schreiben nur der Auslöser.
--  Gefahrlos mehrfach ausführbar, ohne drop. Am Ende eine Probe.
-- =================================================================

create table if not exists public.qs_ausschuss (
  id            uuid primary key,
  job_id        uuid references public.jobs (id) on delete set null,
  machine_id    uuid references public.machines (id) on delete cascade,
  hoco_nr       text,
  stueck        integer not null,
  notiz         text,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid references public.profiles (id) on delete set null,
  erstellt_name text,
  quittiert_am  timestamptz,
  quittiert_von uuid references public.profiles (id) on delete set null
);
create index if not exists qs_ausschuss_zeit on public.qs_ausschuss (erstellt_am);

alter table public.qs_ausschuss enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'qs_ausschuss' and policyname = 'qs_ausschuss lesen') then
    create policy "qs_ausschuss lesen" on public.qs_ausschuss
      for select to authenticated using (not public.ist_extern());
  end if;
end $$;

alter table public.qs_meldungen add column if not exists quittiert_am timestamptz;

create or replace function public.qs_ausschuss_merken()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.qs_ausschuss (id, job_id, machine_id, hoco_nr, stueck, notiz, erstellt_am, erstellt_von, erstellt_name)
    values (new.id, new.job_id, new.machine_id, new.hoco_nr, new.stueck, new.notiz, new.erstellt_am, new.erstellt_von, new.erstellt_name)
    on conflict (id) do update set stueck = excluded.stueck, notiz = excluded.notiz,
      quittiert_am = null, quittiert_von = null;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.qs_ausschuss set stueck = new.stueck, notiz = new.notiz, hoco_nr = new.hoco_nr,
      quittiert_am = new.quittiert_am,
      quittiert_von = case when new.quittiert_am is null then null else coalesce(auth.uid(), quittiert_von) end
    where id = new.id;
    return new;
  else
    if old.quittiert_am is null then
      delete from public.qs_ausschuss where id = old.id;
    end if;
    return old;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'qs_ausschuss_merken') then
    create trigger qs_ausschuss_merken after insert or update or delete on public.qs_meldungen
      for each row execute function public.qs_ausschuss_merken();
  end if;
end $$;

insert into public.qs_ausschuss (id, job_id, machine_id, hoco_nr, stueck, notiz, erstellt_am, erstellt_von, erstellt_name)
select id, job_id, machine_id, hoco_nr, stueck, notiz, erstellt_am, erstellt_von, erstellt_name
from public.qs_meldungen
on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle qs_ausschuss' as punkt,
       case when to_regclass('public.qs_ausschuss') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Spalte quittiert_am',
       case when exists (select 1 from information_schema.columns where table_name = 'qs_meldungen'
                         and column_name = 'quittiert_am') then 'ok' else 'FEHLT' end
union all
select 'Auslöser',
       case when exists (select 1 from pg_trigger where tgname = 'qs_ausschuss_merken') then 'ok' else 'FEHLT' end
union all
select 'Offene Meldungen übernommen',
       case when not exists (select 1 from public.qs_meldungen m
                             where not exists (select 1 from public.qs_ausschuss a where a.id = m.id)) then 'ok' else 'FEHLT' end;
