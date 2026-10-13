-- =================================================================
--  Push-Nachrichten: Empfänger in der Historie (Wunsch Patrick,
--  13. Oktober 2026: „Empfänger einstellen, also Lang, Kurz oder alle“)
--
--  Merkt sich bei jeder gesendeten Nachricht, an wen sie ging
--  (alle, langdreher oder kurzdreher), damit die Historie es zeigt.
--  Senden an eine Gruppe geht auch ohne diese Datei, nur steht dann
--  in der Historie nicht, an wen.
--
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

alter table public.push_nachrichten add column if not exists empfaenger text;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'push_nachrichten' and column_name = 'empfaenger')
  then 'ok' else 'FEHLT' end as push_empfaenger;
