-- Reiter QM: vorerst nur Patrick Ruch (Wunsch Patrick 10. November 2026).
-- Setzt den Vermerk qmSehen in profiles.einstellungen. Mehrfach ausführbar.
update profiles
   set einstellungen = coalesce(einstellungen, '{}'::jsonb) || '{"qmSehen": true}'::jsonb
 where full_name = 'Patrick Ruch';

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from profiles where full_name = 'Patrick Ruch' and (einstellungen->>'qmSehen')::boolean)
            then 'ok' else 'FEHLT' end as probe;
