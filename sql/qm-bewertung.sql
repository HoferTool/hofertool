-- QM, Etappe 2: Managementbewertung (Wunsch Patrick 10. November 2026)
--
-- Was diese Datei tut:
--   1. Tabelle qm_bewertungen: eine Managementbewertung je Jahr und
--      Fassung. Der ganze Inhalt (Geschäftsverlauf, Rückmeldungen,
--      Audits …) steht als JSON in „inhalt“, nur in der Datenbank.
--   2. Eine freigegebene Bewertung lässt sich nicht mehr ändern und
--      nicht mehr löschen (Auslöser qm_bewertung_gesperrt). Ändern geht
--      nur als neue Fassung.
--   3. Die KVP-Massnahmen bekommen „abschnitt“ (in welchem Teil der
--      Bewertung sie stehen: status, veraenderung, jahresziel) und
--      „abgeschlossen_am“ (wann sie erledigt oder wirksam wurden).
--   4. Funktion qm_solar(von, bis): Strom aus der eigenen Anlage als
--      Anteil am Verbrauch, aus den Tageswerten des Solar-Logs.
--   Lesen und schreiben nur mit qm_darf() wie in Etappe 1.
-- Gefahrlos mehrfach ausführbar, ohne „drop“.

create table if not exists public.qm_bewertungen (
  id uuid primary key default gen_random_uuid(),
  jahr integer not null,
  fassung integer not null default 1,
  von date,
  bis date,
  status text not null default 'entwurf',   -- entwurf | freigegeben
  inhalt jsonb not null default '{}'::jsonb,
  freigegeben_am timestamptz,
  freigegeben_von uuid,
  freigegeben_name text,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz not null default now(),
  unique (jahr, fassung)
);

alter table public.qm_bewertungen enable row level security;
grant select, insert, update, delete on public.qm_bewertungen to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'qm_bewertungen' and policyname = 'qm nur mit vermerk') then
    create policy "qm nur mit vermerk" on public.qm_bewertungen for all to authenticated
      using ((select public.qm_darf())) with check ((select public.qm_darf()));
  end if;
end $$;

create or replace function public.qm_bewertung_gesperrt()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'freigegeben' then
      raise exception 'Eine freigegebene Managementbewertung lässt sich nicht löschen.';
    end if;
    return old;
  end if;
  if old.status = 'freigegeben' then
    raise exception 'Die Managementbewertung ist freigegeben. Ändern geht nur als neue Fassung.';
  end if;
  if new.status = 'freigegeben' then
    new.freigegeben_am := coalesce(new.freigegeben_am, now());
    new.freigegeben_von := coalesce(new.freigegeben_von, auth.uid());
  end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'qm_bewertung_gesperrt') then
    create trigger qm_bewertung_gesperrt before update or delete on public.qm_bewertungen
      for each row execute function public.qm_bewertung_gesperrt();
  end if;
end $$;

alter table public.qm_massnahmen add column if not exists abschnitt text;
alter table public.qm_massnahmen add column if not exists abgeschlossen_am date;

-- Eigenstrom: je Tag der höchste Tageswert (der Solar-Log zählt über den
-- Tag hoch), daraus selbst verbraucht / ganzer Verbrauch
create or replace function public.qm_solar(von date, bis date)
returns table (tage integer, ertrag_kwh numeric, eingespeist_kwh numeric, bezug_kwh numeric)
language sql stable security invoker set search_path = public as $$
  with t as (
    select (gemessen at time zone 'Europe/Zurich')::date as tag,
           max(ertrag_tag_kwh) as e, max(eingespeist_tag_kwh) as ein, max(bezug_tag_kwh) as b
    from public.solar_werte
    where (select public.qm_darf())
      and gemessen >= (von::timestamp at time zone 'Europe/Zurich')
      and gemessen < ((bis + 1)::timestamp at time zone 'Europe/Zurich')
    group by 1
  )
  select count(*)::integer, sum(e), sum(ein), sum(b) from t where e is not null;
$$;
revoke all on function public.qm_solar(date, date) from public, anon;
grant execute on function public.qm_solar(date, date) to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle qm_bewertungen' as punkt,
       case when to_regclass('public.qm_bewertungen') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Sperre nach Freigabe',
       case when exists (select 1 from pg_trigger where tgname = 'qm_bewertung_gesperrt') then 'ok' else 'FEHLT' end
union all
select 'Massnahmen: abschnitt',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'qm_massnahmen' and column_name = 'abgeschlossen_am') then 'ok' else 'FEHLT' end
union all
select 'Funktion qm_solar',
       case when to_regprocedure('public.qm_solar(date, date)') is not null then 'ok' else 'FEHLT' end;
