-- =================================================================
--  Kürzel beim Werkzeugwechsel (Wunsch Patrick 2. November 2026)
--  Beim Eintragen eines Werkzeugwechsels tippt man 2 bis 3 Buchstaben
--  ein, wer gewechselt hat (etwa JPF, SH, ET). Diese Datei legt dafür
--  die Spalte tool_changes.kuerzel an und gibt sie (zusammen mit der
--  Standzeit gehalten_stk) auch in der Sicht werkzeugwechsel heraus.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

alter table public.tool_changes add column if not exists kuerzel text;

-- Neue Spalten nur hinten anhängen, sonst nimmt create or replace sie nicht
create or replace view public.werkzeugwechsel with (security_invoker = true) as
 select w.id, w.machine_id, w.job_id, w.hoco_nr, w.tool_nr, w.bezeichnung, w.grund,
    w.stueckzahl, w.notiz, w.gewechselt_am, w.created_by,
    m.name as maschine, m.machine_number as maschine_nr,
    p.full_name as person, j.job_number as auftrag_nr,
    w.gehalten_stk, w.kuerzel
   from tool_changes w
     left join machines m on m.id = w.machine_id
     left join profiles p on p.id = w.created_by
     left join jobs j on j.id = w.job_id;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns
  where table_name = 'werkzeugwechsel' and column_name = 'kuerzel') then 'ok' else 'FEHLT' end as probe;
