-- =================================================================
--  ANMELDUNG MIT PIN (Schritt 1 von 2)
--
--  Bisher kam man mit "ohne Passwort" über ein gemeinsames Passwort
--  hinein, das im öffentlichen Code stand. Damit konnte sich jeder im
--  Internet als diese Personen anmelden.
--
--  Neu: Kachel antippen und die eigene PIN eingeben. Die PIN liegt nur
--  verschlüsselt in der Datenbank und wird auf dem Server geprüft. Nach
--  5 falschen Versuchen ist das Konto 5 Minuten gesperrt, danach gibt es
--  wieder 5 Versuche, und so weiter.
--
--  Wer eine PIN setzt, bekommt dabei ein zufälliges, unbekanntes
--  Passwort. Damit funktioniert für dieses Konto nur noch die PIN.
--
--  Dieses Skript ändert an bestehenden Anmeldungen noch nichts. Erst
--  Schritt 2 (offenes-passwort-weg.sql) sperrt das alte Passwort.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

create extension if not exists pgcrypto with schema extensions;

-- Die PINs und der Zähler für Fehlversuche. Niemand darf die Tabelle
-- direkt lesen oder ändern, nur die Funktionen unten.
create table if not exists public.pin_schutz (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  pin_hash     text not null,
  fehler       integer not null default 0,
  gesperrt_bis timestamptz,
  geaendert_am timestamptz not null default now()
);
alter table public.pin_schutz enable row level security;
revoke all on public.pin_schutz from anon, authenticated;

-- ---------- PIN setzen ----------
-- Für sich selbst, oder als Admin für jemand anderen.
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
  if ziel <> auth.uid() and not bin_admin() then
    raise exception 'Nur ein Admin darf die PIN von anderen setzen';
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

  -- Das bisherige Passwort (auch ein altes gemeinsames) gilt nicht mehr
  update auth.users
     set encrypted_password = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf'))
   where id = ziel;
end;
$$;

revoke all on function public.pin_setzen(text, uuid) from public, anon;
grant execute on function public.pin_setzen(text, uuid) to authenticated;

-- ---------- PIN entfernen ----------
-- Nur für sich selbst. Die App setzt vorher ein neues Passwort.
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
  delete from public.pin_schutz where user_id = auth.uid();
  update public.profiles set ohne_passwort = false where id = auth.uid();
end;
$$;

revoke all on function public.pin_entfernen() from public, anon;
grant execute on function public.pin_entfernen() to authenticated;

-- ---------- Wer hat schon eine PIN ----------
-- Für die Nutzerliste der Admins. Liefert nur ja/nein, nie die PIN.
create or replace function public.pin_vorhanden()
returns table (user_id uuid)
language sql
security definer
set search_path = public
as $$
  select p.user_id from public.pin_schutz p where bin_admin() or p.user_id = auth.uid();
$$;

revoke all on function public.pin_vorhanden() from public, anon;
grant execute on function public.pin_vorhanden() to authenticated;

-- ---------- PIN prüfen ----------
-- Nur die Server-Funktion "pin-anmelden" darf das aufrufen, nicht die
-- App. Zählt Fehlversuche: beim fünften falschen 5 Minuten Sperre.
create or replace function public.pin_pruefen(p_email text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  s public.pin_schutz%rowtype;
begin
  select id into v_id from public.profiles
   where lower(email) = lower(p_email) and is_active = true;
  if v_id is null then
    return jsonb_build_object('status', 'keine_pin');
  end if;

  select * into s from public.pin_schutz where user_id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'keine_pin');
  end if;

  if s.gesperrt_bis is not null and s.gesperrt_bis > now() then
    return jsonb_build_object('status', 'gesperrt',
      'sekunden', ceil(extract(epoch from s.gesperrt_bis - now()))::int);
  end if;

  if p_pin ~ '^[0-9]{4,8}$' and s.pin_hash = crypt(p_pin, s.pin_hash) then
    update public.pin_schutz set fehler = 0, gesperrt_bis = null where user_id = v_id;
    return jsonb_build_object('status', 'ok');
  end if;

  if s.fehler + 1 >= 5 then
    update public.pin_schutz
       set fehler = 0, gesperrt_bis = now() + interval '5 minutes'
     where user_id = v_id;
    return jsonb_build_object('status', 'gesperrt', 'sekunden', 300);
  end if;

  update public.pin_schutz set fehler = fehler + 1 where user_id = v_id;
  return jsonb_build_object('status', 'falsch', 'rest', 5 - (s.fehler + 1));
end;
$$;

revoke all on function public.pin_pruefen(text, text) from public, anon, authenticated;
grant execute on function public.pin_pruefen(text, text) to service_role;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle pin_schutz' as punkt,
       case when to_regclass('public.pin_schutz') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Funktion pin_setzen',
       case when to_regprocedure('public.pin_setzen(text,uuid)') is not null then 'ok' else 'FEHLT' end
union all
select 'Funktion pin_pruefen',
       case when to_regprocedure('public.pin_pruefen(text,text)') is not null then 'ok' else 'FEHLT' end
union all
select 'App darf pin_pruefen nicht',
       case when has_function_privilege('anon', 'public.pin_pruefen(text,text)', 'execute')
              or has_function_privilege('authenticated', 'public.pin_pruefen(text,text)', 'execute')
            then 'FEHLT' else 'ok' end;
