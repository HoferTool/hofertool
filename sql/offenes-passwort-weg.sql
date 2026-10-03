-- =================================================================
--  ALTES GEMEINSAMES PASSWORT SPERREN (Schritt 2 von 2)
--
--  ACHTUNG: Entscheid vom 3. Oktober 2026: NICHT ausführen. Die Datei
--  bleibt als Möglichkeit liegen. Nur nach ausdrücklichem Auftrag.
--
--  Erst ausführen, wenn
--    1. pin-anmeldung.sql gelaufen ist und
--    2. du dir in der App selbst eine PIN gesetzt hast
--       (Einstellungen → Allgemein → PIN) und
--    3. du den anderen unter Einstellungen → Nutzer eine PIN gegeben
--       hast, so weit du sie kennst.
--
--  Was es tut: Alle Konten, die bisher "ohne Passwort" hineinkamen und
--  noch keine PIN haben, bekommen ein zufälliges Passwort. Das alte
--  gemeinsame Passwort aus dem Code funktioniert danach nirgends mehr.
--  Wer noch keine PIN hat, kommt erst wieder hinein, wenn ein Admin ihm
--  eine PIN setzt.
--
--  Sicherung: Läuft nur, wenn mindestens ein Admin schon eine PIN hat.
--  So kann sich niemand selbst aussperren.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

do $$
begin
  if not exists (
    select 1 from public.profiles p join public.pin_schutz s on s.user_id = p.id
     where p.role = 'admin' and p.is_active = true
  ) then
    raise exception 'Noch kein Admin mit PIN. Bitte zuerst in der App eine PIN setzen.';
  end if;

  update auth.users u
     set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'),
                                               extensions.gen_salt('bf'))
    from public.profiles p
   where p.id = u.id
     and p.ohne_passwort = true
     and not exists (select 1 from public.pin_schutz s where s.user_id = p.id);
end;
$$;

-- ---------- Probe ----------
-- "ok" heisst: kein Konto lässt sich mehr mit dem alten Passwort öffnen.
select 'Altes gemeinsames Passwort' as punkt,
       case when exists (
         select 1 from auth.users
          where encrypted_password = extensions.crypt('hofer-offen-2026', encrypted_password)
       ) then 'FEHLT' else 'ok' end as ergebnis
union all
-- Diese Personen brauchen noch eine PIN vom Admin
select 'Noch ohne PIN: ' || coalesce(p.full_name, p.email), 'PIN setzen'
  from public.profiles p
 where p.is_active = true and p.ohne_passwort = true
   and not exists (select 1 from public.pin_schutz s where s.user_id = p.id);
