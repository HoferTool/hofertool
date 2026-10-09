-- =================================================================
--  EIGENES PASSWORT UND EIGENE PIN  (seit 1.2.0)
--
--  Was diese Datei macht (Wunsch Patrick, 9. Oktober 2026):
--  1. Jeder darf für sein EIGENES Konto eine PIN setzen oder entfernen.
--     Admins dürfen das wie bisher für alle.
--  2. Neu: "Ohne Passwort" fürs eigene Konto. Danach genügt ein Tipp auf
--     die Kachel (wie das Häkchen "ohne Passwort" beim Admin). Nicht für
--     Externe und das Dienstkonto.
--  3. Konten mit Häkchen "Andere Nutzer" (Planwand, Pad, Päckli) dürfen
--     an sich selbst nichts davon ändern, das bleibt beim Admin.
--  4. Die Spalten ohne_passwort und andere_nutzer in profiles ändert nur
--     noch ein Admin oder eine dieser Funktionen, nicht mehr jeder an
--     seiner eigenen Zeile (sonst käme man um die Regeln herum).
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok/FEHLT.
-- =================================================================

-- ---------- Wer darf an diesem Konto Anmeldung ändern ----------
create or replace function public.anmeldung_darf(p_ziel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    bin_admin()
    or (p_ziel = auth.uid() and exists (
          select 1 from public.profiles p
           where p.id = p_ziel and p.is_active
             and not coalesce(p.andere_nutzer, false)
             and p.role <> 'dienst')));
$$;

revoke all on function public.anmeldung_darf(uuid) from public, anon;
grant execute on function public.anmeldung_darf(uuid) to authenticated;

-- ---------- 1. PIN setzen ----------
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
  if not anmeldung_darf(ziel) then
    raise exception 'Das darfst du an diesem Konto nicht ändern';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Die PIN braucht 4 bis 8 Ziffern';
  end if;

  insert into public.pin_schutz (user_id, pin_hash, fehler, gesperrt_bis, geaendert_am)
  values (ziel, crypt(p_pin, gen_salt('bf')), 0, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, fehler = 0, gesperrt_bis = null, geaendert_am = now();

  -- Ab jetzt meldet sich die Person an der Kachel mit PIN an
  perform set_config('hofer.anmeldung', '1', true);
  update public.profiles set ohne_passwort = true where id = ziel;

  -- Das bisherige Passwort gilt nicht mehr
  update auth.users
     set encrypted_password = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf'))
   where id = ziel;
end;
$$;

revoke all on function public.pin_setzen(text, uuid) from public, anon;
grant execute on function public.pin_setzen(text, uuid) to authenticated;

-- ---------- PIN entfernen (eigenes Konto) ----------
-- Die App setzt vorher ein neues Passwort, sonst wäre das Konto offen.
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
  if not anmeldung_darf(auth.uid()) then
    raise exception 'Das darfst du an diesem Konto nicht ändern';
  end if;
  delete from public.pin_schutz where user_id = auth.uid();
  perform set_config('hofer.anmeldung', '1', true);
  update public.profiles set ohne_passwort = false where id = auth.uid();
end;
$$;

revoke all on function public.pin_entfernen() from public, anon;
grant execute on function public.pin_entfernen() to authenticated;

-- ---------- 2. Ohne Passwort (eigenes Konto) ----------
create or replace function public.ohne_passwort_setzen()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not anmeldung_darf(auth.uid()) then
    raise exception 'Das darfst du an diesem Konto nicht ändern';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'extern') then
    raise exception 'Externe Konten brauchen immer ein Passwort';
  end if;

  delete from public.pin_schutz where user_id = auth.uid();
  perform set_config('hofer.anmeldung', '1', true);
  update public.profiles set ohne_passwort = true where id = auth.uid();

  -- Das bisherige Passwort gilt nicht mehr, hinein geht es mit einem Tipp
  update auth.users
     set encrypted_password = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf'))
   where id = auth.uid();
end;
$$;

revoke all on function public.ohne_passwort_setzen() from public, anon;
grant execute on function public.ohne_passwort_setzen() to authenticated;

-- ---------- 4. Spalten schützen ----------
create or replace function public.profil_schutz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  anzahl_admins integer;
begin
  -- Änderungen direkt im Supabase-Dashboard durchlassen
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active then

    if not public.bin_admin() then
      raise exception 'Nur ein Administrator darf Rolle oder Status ändern';
    end if;

    -- War der Betroffene ein aktiver Administrator und ist es danach
    -- nicht mehr, muss noch mindestens ein weiterer übrig bleiben.
    if old.role = 'admin' and old.is_active
       and (new.role <> 'admin' or not new.is_active) then

      select count(*) into anzahl_admins
        from public.profiles
        where role = 'admin' and is_active = true and id <> old.id;

      if anzahl_admins = 0 then
        raise exception
          'Das ist der letzte Administrator. Bitte zuerst einen weiteren Administrator festlegen.';
      end if;
    end if;
  end if;

  -- Wie man hineinkommt, ändern nur Admins oder die Funktionen oben
  if (new.ohne_passwort is distinct from old.ohne_passwort
      or new.andere_nutzer is distinct from old.andere_nutzer)
     and not public.bin_admin()
     and coalesce(current_setting('hofer.anmeldung', true), '') <> '1' then
    raise exception 'Die Anmeldung änderst du unter Einstellungen → Allgemein';
  end if;

  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select
  case when to_regprocedure('public.ohne_passwort_setzen()') is not null then 'ok' else 'FEHLT' end
    as ohne_passwort_setzen,
  case when pg_get_functiondef('public.pin_setzen(text, uuid)'::regprocedure) like '%anmeldung_darf%'
       then 'ok' else 'FEHLT' end as pin_setzen_eigenes,
  case when pg_get_functiondef('public.profil_schutz()'::regprocedure) like '%hofer.anmeldung%'
       then 'ok' else 'FEHLT' end as spalten_geschuetzt;
