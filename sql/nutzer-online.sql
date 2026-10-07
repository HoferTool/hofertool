-- =================================================================
--  ZULETZT ONLINE  (seit 111.90.0)
--
--  Was diese Datei macht:
--  1. Neue Spalte profiles.zuletzt_online. Die App meldet sich alle
--     zwei Minuten, solange sie offen und sichtbar ist (ich_bin_da).
--  2. nutzer_status(): nur für Admins. Gibt je Person "zuletzt online"
--     und die letzte Anmeldung zurück (die steht in der Anmeldung von
--     Supabase, die die App sonst nicht lesen kann).
--  Einstellungen -> Nutzer zeigt das in der Liste.
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok/FEHLT.
-- =================================================================

alter table public.profiles add column if not exists zuletzt_online timestamptz;

create or replace function public.ich_bin_da()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set zuletzt_online = now() where id = auth.uid();
$$;

revoke all on function public.ich_bin_da() from public, anon;
grant execute on function public.ich_bin_da() to authenticated;

create or replace function public.nutzer_status()
returns table (user_id uuid, zuletzt_online timestamptz, letzte_anmeldung timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not bin_admin() then
    raise exception 'Nur für Admins';
  end if;
  return query
    select p.id, p.zuletzt_online, u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.id;
end;
$$;

revoke all on function public.nutzer_status() from public, anon;
grant execute on function public.nutzer_status() to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte zuletzt_online' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'profiles' and column_name = 'zuletzt_online') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Lebenszeichen ich_bin_da',
       case when to_regprocedure('public.ich_bin_da()') is not null then 'ok' else 'FEHLT' end
union all
select 'Status für Admins nutzer_status',
       case when to_regprocedure('public.nutzer_status()') is not null then 'ok' else 'FEHLT' end;
