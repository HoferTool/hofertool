-- QM, Etappe 1: KVP-Massnahmen, Messgrössen und Wirtschaftszahlen
-- (Wunsch Patrick 10. November 2026: QM-Tool nach ISO 9001 mit dem KVP
-- im Zentrum, Managementbewertung mit Kennzahlen und Jahreszahlen)
--
-- Was diese Datei tut:
--   1. Funktion qm_darf(): ja, wenn am eigenen Konto der Vermerk qmSehen
--      steht und die Person nicht extern ist.
--   2. Tabelle qm_massnahmen: die zentrale KVP-Liste (Thema, Massnahme,
--      wer, bis wann, Messgrösse, Ziel, Stand, Wirksamkeit, Quelle).
--   3. Tabelle qm_messgroessen: welche Kennzahlen gemessen werden, mit
--      Ziel, Richtung und Ampel-Grenzen.
--   4. Tabelle qm_jahreswerte: die Zahlen je Jahr (Umsatz, EBIT …).
--      Die Zahlen selbst stehen nur in der Datenbank, nie hier.
--   5. Lesen und schreiben darf alles nur, wer qm_darf() hat.
-- Gefahrlos mehrfach ausführbar, ohne „drop“.

create or replace function public.qm_darf()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (p.einstellungen->>'qmSehen')::boolean and p.role is distinct from 'extern'
                     from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.qm_darf() from public, anon;
grant execute on function public.qm_darf() to authenticated;

create table if not exists public.qm_messgroessen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  einheit text,
  quelle text not null default 'jahr',      -- jahr | hand | auto
  schluessel text,                          -- Kennzahl aus Jahreswerten oder App
  ziel numeric,
  richtung text not null default 'hoch',    -- hoch = mehr ist besser, tief = weniger
  gelb numeric,                             -- ab hier gelb (Abstand zum Ziel)
  verantwortlich text,
  norm text,                                -- Kapitel ISO 9001, etwa 9.1.3
  notiz text,
  aktiv boolean not null default true,
  sort integer not null default 0,
  geaendert_am timestamptz not null default now()
);

create table if not exists public.qm_massnahmen (
  id uuid primary key default gen_random_uuid(),
  nr integer,
  thema text,
  massnahme text not null default '',
  beschreibung text,
  wer text,
  termin date,
  messgroesse_id uuid references public.qm_messgroessen(id) on delete set null,
  ziel text,
  ist text,
  status text not null default 'offen',     -- offen | laeuft | erledigt | wirksam | unwirksam
  wirksamkeit text,
  quelle text,                              -- Managementbewertung 2025, Audit …
  periode integer,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  geaendert_am timestamptz not null default now()
);

create table if not exists public.qm_jahreswerte (
  jahr integer not null,
  schluessel text not null,
  wert numeric,
  notiz text,
  geaendert_am timestamptz not null default now(),
  primary key (jahr, schluessel)
);

alter table public.qm_messgroessen enable row level security;
alter table public.qm_massnahmen enable row level security;
alter table public.qm_jahreswerte enable row level security;
grant select, insert, update, delete on public.qm_messgroessen, public.qm_massnahmen, public.qm_jahreswerte to authenticated;

do $$
declare t text;
begin
  foreach t in array array['qm_messgroessen', 'qm_massnahmen', 'qm_jahreswerte'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = t and policyname = 'qm nur mit vermerk') then
      execute format('create policy "qm nur mit vermerk" on public.%I for all to authenticated
        using ((select public.qm_darf())) with check ((select public.qm_darf()))', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabellen (3)' as punkt,
       case when to_regclass('public.qm_messgroessen') is not null
             and to_regclass('public.qm_massnahmen') is not null
             and to_regclass('public.qm_jahreswerte') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (3)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename like 'qm\_%' and policyname = 'qm nur mit vermerk') >= 3 then 'ok' else 'FEHLT' end
union all
select 'Funktion qm_darf',
       case when to_regprocedure('public.qm_darf()') is not null then 'ok' else 'FEHLT' end;
