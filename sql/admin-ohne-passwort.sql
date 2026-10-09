-- =================================================================
--  ADMIN: PASSWORT UND PIN BEI EINEM KONTO ENTFERNEN  (seit 1.13.0)
--
--  Was diese Datei macht (Wunsch Patrick, 9. Oktober 2026: "will als
--  admin bei jedem, egal was rolle ist pw pin entfernen können"):
--  Neue Funktion ohne_passwort_fuer(Konto). Nur ein Admin darf sie
--  aufrufen, für jedes Konto, auch Gerätekonten (Planwand, Pad Mode,
--  Päckli Pad ...). Danach gilt am Konto weder Passwort noch PIN mehr,
--  hinein geht es mit einem Tipp auf die Kachel.
--  Externe und das Dienstkonto lässt der Server nie ohne Passwort
--  hinein (sonst wären sie ausgesperrt). Bei ihnen entfernt
--  "Passwort setzen" die PIN.
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok/FEHLT.
-- =================================================================

create or replace function public.ohne_passwort_fuer(p_ziel uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not public.bin_admin() then
    raise exception 'Das darf nur ein Administrator';
  end if;
  if not exists (select 1 from public.profiles where id = p_ziel) then
    raise exception 'Dieses Konto gibt es nicht';
  end if;
  if exists (select 1 from public.profiles where id = p_ziel and role in ('extern', 'dienst')) then
    raise exception 'Externe und das Dienstkonto brauchen immer ein Passwort';
  end if;

  delete from public.pin_schutz where user_id = p_ziel;
  perform set_config('hofer.anmeldung', '1', true);
  update public.profiles set ohne_passwort = true where id = p_ziel;

  -- Das bisherige Passwort gilt nicht mehr, hinein geht es mit einem Tipp
  update auth.users
     set encrypted_password = crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf'))
   where id = p_ziel;
end;
$$;

revoke all on function public.ohne_passwort_fuer(uuid) from public, anon;
grant execute on function public.ohne_passwort_fuer(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select
  case when to_regprocedure('public.ohne_passwort_fuer(uuid)') is not null then 'ok' else 'FEHLT' end
    as ohne_passwort_fuer;
