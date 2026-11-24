-- =================================================================
--  UMFRAGEN: JEDER DARF ERSTELLEN
--
--  Wunsch Patrick 24. November 2026: „Umfragen soll jeder erstellen
--  können auf Start“. Neu dürfen alle Angemeldeten ausser Externen und
--  Dienst eine Umfrage anlegen. Ändern, schliessen und löschen darf
--  sie, wer sie erstellt hat (erstellt_von), Admins weiter alle.
--  Die Regeln für Admins bleiben unverändert, es kommen nur neue dazu.
--
--  Dazu Spalte namen_zeigen: mit Häkchen sehen alle, wer was gestimmt
--  hat (Wunsch Patrick 24. November 2026), sonst nur Ersteller und Admins.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Probe am Ende.
-- =================================================================

alter table public.umfragen add column if not exists namen_zeigen boolean not null default false;

create or replace function public.umfrage_darf_erstellen()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.darf_lesen(), false) and not coalesce(public.ist_extern(), false)
    and coalesce(public.meine_rolle(), '') <> 'dienst'
$$;

create or replace function public.umfrage_ist_meine(p_umfrage uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.umfragen where id = p_umfrage and erstellt_von = auth.uid())
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'umfragen' and policyname = 'umfragen eigene') then
    create policy "umfragen eigene" on public.umfragen for all to authenticated
      using ((select public.umfrage_darf_erstellen()) and erstellt_von = (select auth.uid()))
      with check ((select public.umfrage_darf_erstellen()) and erstellt_von = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'umfrage_vorschlaege' and policyname = 'umfrage_vorschlaege eigene') then
    create policy "umfrage_vorschlaege eigene" on public.umfrage_vorschlaege for all to authenticated
      using ((select public.umfrage_darf_erstellen()) and public.umfrage_ist_meine(umfrage_id))
      with check ((select public.umfrage_darf_erstellen()) and public.umfrage_ist_meine(umfrage_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'umfrage_stimmen' and policyname = 'umfrage_stimmen eigene') then
    create policy "umfrage_stimmen eigene" on public.umfrage_stimmen for delete to authenticated
      using ((select public.umfrage_darf_erstellen()) and public.umfrage_ist_meine(umfrage_id));
  end if;
end $$;

notify pgrst, 'reload schema';

select case when count(*) = 3 and exists (select 1 from information_schema.columns
  where table_name = 'umfragen' and column_name = 'namen_zeigen') then 'ok' else 'FEHLT' end as probe
from pg_policies where schemaname = 'public'
  and policyname in ('umfragen eigene', 'umfrage_vorschlaege eigene', 'umfrage_stimmen eigene');
