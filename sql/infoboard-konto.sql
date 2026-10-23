-- Konto „Infoboard“ für den grossen Bildschirm im Gang
-- (Wunsch Patrick 21. Oktober 2026: „ein Login nur für das Infoboard wie
-- Planwand, dann soll direkt die Vollbildanzeige starten“).
--
-- Was die Datei tut:
--  * legt das Konto infoboard@hoferco.ch an, falls es noch fehlt, mit einem
--    zufälligen Passwort, das niemand kennt; PIN oder Passwort setzt danach
--    ein Admin in der App unter Einstellungen → Nutzer
--  * Rolle „mitarbeiter“ (darf alles sehen, aber fast nichts ändern),
--    steht bei „Andere Nutzer“, wird also nie von selbst abgemeldet
--  * Vermerk infoboardBildschirm in den Einstellungen: nach dem Anmelden
--    geht das Infoboard sofort über den ganzen Bildschirm auf
-- Gefahrlos mehrfach ausführbar.

do $$
declare
  neu uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where lower(email) = 'infoboard@hoferco.ch') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', neu, 'authenticated', 'authenticated',
      'infoboard@hoferco.ch', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"email_verified":true,"full_name":"Infoboard"}',
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), neu, neu::text, 'email',
      jsonb_build_object('sub', neu::text, 'email', 'infoboard@hoferco.ch',
        'email_verified', true, 'phone_verified', false), now(), now(), now());
  end if;
end $$;

update public.profiles
   set full_name = 'Infoboard', role = 'mitarbeiter', andere_nutzer = true, is_active = true,
       einstellungen = coalesce(einstellungen, '{}'::jsonb) || '{"infoboardBildschirm": true}'::jsonb
 where lower(email) = 'infoboard@hoferco.ch';

notify pgrst, 'reload schema';

-- Probe
select case when exists (
  select 1 from public.profiles
   where lower(email) = 'infoboard@hoferco.ch' and andere_nutzer
     and (einstellungen ->> 'infoboardBildschirm')::boolean)
  then 'ok' else 'FEHLT' end as infoboard_konto;
