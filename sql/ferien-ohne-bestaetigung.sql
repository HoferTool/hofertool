-- =================================================================
--  Ferien ohne Bestätigung (Wunsch Patrick, 9. Oktober 2026)
--  Alle Ferien gelten als bestätigt, und neue Einträge auch.
--  Gefahrlos mehrfach ausführbar. Am 9. Oktober 2026 schon von
--  Claude eingespielt.
-- =================================================================
alter table public.vacations alter column genehmigt set default true;
update public.vacations set genehmigt = true where genehmigt is distinct from true;

notify pgrst, 'reload schema';

-- Probe
select case when count(*) = 0 then 'ok' else 'FEHLT' end as ferien_bestaetigt
from public.vacations where genehmigt is distinct from true;
