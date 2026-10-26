-- Bereich „Empfang“ nur für bestimmte Personen (Wunsch Patrick 26. Oktober 2026)
--
-- Was diese Datei tut: Sie setzt bei zwei Konten den Vermerk empfangSehen
-- in den persönlichen Einstellungen. Nur wer ihn hat, sieht in der App den
-- Bereich Empfang. Der Bildschirm am Empfang zeigt seine Anzeige trotzdem.
-- Gefahrlos mehrfach ausführbar. Die Konten stehen nur über ihre Kennung
-- da, damit keine Namen im Repository stehen.

update profiles
   set einstellungen = coalesce(einstellungen, '{}'::jsonb) || '{"empfangSehen": true}'::jsonb
 where id in ('38ab42d6-da0b-48bc-a71a-8fe305843aa4', '79e748e5-368b-4ec3-8580-b65c0cc9f5cf');

notify pgrst, 'reload schema';

-- Probe: zeigt ok, wenn beide den Vermerk haben
select case when count(*) = 2 then 'ok' else 'FEHLT' end as probe
  from profiles
 where id in ('38ab42d6-da0b-48bc-a71a-8fe305843aa4', '79e748e5-368b-4ec3-8580-b65c0cc9f5cf')
   and (einstellungen->>'empfangSehen')::boolean;
