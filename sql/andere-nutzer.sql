-- =================================================================
--  ANDERE NUTZER UND PASSWÖRTER NUR VOM ADMIN  (seit 111.85.0)
--
--  Was diese Datei macht:
--  1. Neues Häkchen "Andere Nutzer" an jedem Konto (profiles.andere_nutzer).
--     Solche Konten (Planwand, Pad Mode, Päckli Pad ...) stehen bei der
--     Anmeldung nicht zwischen den Leuten, sondern unten unter
--     "Andere Nutzer". Beim ersten Ausführen bekommen alle Konten mit der
--     Rolle "Planwand" das Häkchen; danach setzt es nur noch der Admin
--     unter Einstellungen -> Nutzer.
--  2. Die Anmeldekacheln (login_kacheln) kennen das Häkchen.
--  3. PIN setzen und PIN entfernen darf nur noch ein Admin, auch für das
--     eigene Konto. Passwörter anderer setzt schon bisher nur der Admin.
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok/FEHLT.
-- =================================================================

-- ---------- 1. Häkchen ----------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles'
                   and column_name = 'andere_nutzer') then
    alter table public.profiles add column andere_nutzer boolean not null default false;
    -- Nur beim ersten Mal: die bisherigen Gerätekonten haben die Rolle Planwand
    update public.profiles set andere_nutzer = true where role = 'planwand';
  end if;
end $$;

-- ---------- 2. Anmeldekacheln ----------
create or replace view public.login_kacheln as
  select k.email, k.full_name, k.bild_url, k.ohne_passwort, k.role, k.andere_nutzer
  from public.profiles k
  where k.is_active = true
  order by k.full_name;

grant select on public.login_kacheln to anon, authenticated;

-- ---------- 3. PIN nur vom Admin ----------
create or replace function public.pin_setzen(p_pin text, p_ziel uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ziel uuid := coalesce(p_ziel, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not bin_admin() then
    raise exception 'PIN und Passwort setzt nur ein Admin';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Die PIN braucht 4 bis 8 Ziffern';
  end if;

  insert into public.pin_schutz (user_id, pin_hash, fehler, gesperrt_bis, geaendert_am)
  values (ziel, crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, fehler = 0, gesperrt_bis = null, geaendert_am = now();

  -- Ab jetzt meldet sich die Person an der Kachel mit PIN an
  update public.profiles set ohne_passwort = true where id = ziel;

  -- Das bisherige Passwort gilt nicht mehr
  update auth.users
     set encrypted_password = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf'))
   where id = ziel;
end;
$$;

revoke all on function public.pin_setzen(text, uuid) from public, anon;
grant execute on function public.pin_setzen(text, uuid) to authenticated;

create or replace function public.pin_entfernen()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not bin_admin() then
    raise exception 'PIN und Passwort setzt nur ein Admin';
  end if;
  delete from public.pin_schutz where user_id = auth.uid();
  update public.profiles set ohne_passwort = false where id = auth.uid();
end;
$$;

revoke all on function public.pin_entfernen() from public, anon;
grant execute on function public.pin_entfernen() to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Häkchen Andere Nutzer' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'profiles' and column_name = 'andere_nutzer') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Anmeldekacheln kennen es',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'login_kacheln' and column_name = 'andere_nutzer') then 'ok' else 'FEHLT' end
union all
select 'PIN nur vom Admin',
       case when pg_get_functiondef('public.pin_setzen(text, uuid)'::regprocedure) like '%setzt nur ein Admin%'
            then 'ok' else 'FEHLT' end
union all
select 'Konten unter Andere Nutzer: ' || (select count(*) from public.profiles where andere_nutzer)::text, 'ok';
