-- =================================================================
--  TEMP-ORDNER PRO PERSON (1.38.0)
--
--  Was das tut, in einfachen Worten:
--  Im Menü steht vor Google der Reiter „Temp“. Dort legt jede Person
--  Dateien, Fotos und Videos ab, etwa vom Handy, und holt sie am
--  Computer wieder herunter (Wunsch Patrick, 12. Oktober 2026).
--
--  Diese Datei legt dafür die Ablage „temp“ an:
--    - nicht öffentlich, höchstens 500 MB je Datei (seit Supabase Pro; die Grenze des
--      ganzen Projekts unter Storage → Settings muss mindestens so hoch sein)
--    - jede Datei liegt im Ordner <Konto-Kennung>/…
--    - Lesen, Hochladen, Ändern und Löschen nur im eigenen Ordner.
--      Das prüft die Datenbank, nicht die App: auch Admins sehen
--      die Ordner anderer nicht.
--  Nach 24 Stunden löscht die Server-Funktion „temp-aufraeumen“
--  (supabase/functions/) die Dateien; die App ruft sie höchstens stündlich.
--  Die Sicherung lässt die Ablage „temp“ aus (src/teile/sicherung.js).
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('temp', 'temp', false, 524288000)
on conflict (id) do update set public = false, file_size_limit = 524288000;

-- Ohne "drop": so läuft die Datei auch über die Supabase-Verbindung
-- ohne Rückfrage, und mehrfach Ausführen schadet nicht.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'temp eigenes lesen') then
    create policy "temp eigenes lesen" on storage.objects for select to authenticated
      using (bucket_id = 'temp' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'temp eigenes hochladen') then
    create policy "temp eigenes hochladen" on storage.objects for insert to authenticated
      with check (bucket_id = 'temp' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'temp eigenes aendern') then
    create policy "temp eigenes aendern" on storage.objects for update to authenticated
      using (bucket_id = 'temp' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'temp' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'temp eigenes loeschen') then
    create policy "temp eigenes loeschen" on storage.objects for delete to authenticated
      using (bucket_id = 'temp' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Ablage temp (nicht öffentlich)' as punkt,
       case when exists (select 1 from storage.buckets where id = 'temp' and not public) then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln eigener Ordner',
       case when (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname like 'temp eigenes %') = 4 then 'ok' else 'FEHLT' end;
