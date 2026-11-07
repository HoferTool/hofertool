-- =================================================================
--  MASCHINENTYP JE PERSON, ALLE SEHEN ALLE PARKS (1.445.0, Wunsch
--  Patrick 7. November 2026: „bei Einstellungen einteilen, welchen Typ
--  er arbeitet … dann kannst du wieder für alle alles sichtbar machen“)
--
--  Was das tut, in einfachen Worten:
--  1. Neue Spalte profiles.typen: die Maschinentypen, an denen eine
--     Person arbeitet (Einstellungen → Nutzer). Die App wählt sie in
--     Produktion und Pad vor und zeigt auf der Startseite die Probleme
--     dieser Typen zuerst.
--  2. QS-Meldungen sieht, meldet und quittiert wieder jede Person an
--     allen Maschinen (nicht mehr nur im eigenen Park). Externe sehen
--     weiterhin nichts davon.
--
--  Ohne drop, gefahrlos mehrfach ausführbar. Am Ende eine Probe.
-- =================================================================

alter table public.profiles add column if not exists typen uuid[] not null default '{}';

create or replace function public.qs_darf_maschine(m_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((
    select p.role <> 'extern'
    from public.profiles p
    where p.id = auth.uid()), false)
$$;

grant execute on function public.qs_darf_maschine(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte profiles.typen' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'profiles' and column_name = 'typen') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'QS ohne Park',
       case when pg_get_functiondef('public.qs_darf_maschine(uuid)'::regprocedure) not like '%parks%' then 'ok' else 'FEHLT' end;
