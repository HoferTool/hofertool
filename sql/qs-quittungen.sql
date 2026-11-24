-- =================================================================
--  QUITTUNGEN FÜR MASSNAHMEN AUS REKLAMATIONEN (1.790.0, Wunsch
--  Patrick 24. November 2026: „sobald man den Auftrag startet … und
--  wenn man auf läuft stellt, Meldung zum Quittieren“)
--
--    qs_quittungen  je Auftrag, Massnahme und Anlass (Rüsten, läuft)
--                   eine Zeile: wer (Kürzel), wann, FA Nr., Maschine.
--                   Daraus zeigt die Reklamation in D8 den Nachweis
--                   „Umgesetzt am … von … FA … Maschine“.
--
--  Lesen und quittieren: alle, die lesen dürfen, ausser Externen.
--  Löschen: nur Admins. Gefahrlos mehrfach ausführbar. Am Ende eine
--  Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.qs_quittungen (
  id        uuid primary key default gen_random_uuid(),
  job_id    uuid,
  hoco_nr   text,
  rk_id     uuid,
  rk_nr     text,
  anlass    text,
  kuerzel   text,
  fa_nr     text,
  maschine  text,
  am        timestamptz not null default now(),
  von       uuid default auth.uid()
);
create index if not exists qs_quittungen_rk on public.qs_quittungen (rk_id);
create index if not exists qs_quittungen_job on public.qs_quittungen (job_id);
alter table public.qs_quittungen enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'qs_quittungen' and policyname = 'lesen') then
    create policy "lesen" on public.qs_quittungen for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'qs_quittungen' and policyname = 'quittieren') then
    create policy "quittieren" on public.qs_quittungen for insert to authenticated
      with check ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'qs_quittungen' and policyname = 'loeschen') then
    create policy "loeschen" on public.qs_quittungen for delete to authenticated
      using ((select public.bin_admin()));
  end if;
end $$;

grant select, insert, delete on public.qs_quittungen to authenticated;

notify pgrst, 'reload schema';

select 'Tabelle qs_quittungen' as was,
       case when exists (select 1 from pg_policies where tablename = 'qs_quittungen' and policyname = 'quittieren')
            then 'ok' else 'FEHLT' end as stand;
