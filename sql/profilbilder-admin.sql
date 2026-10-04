-- Profilbilder: Administratoren dürfen für alle Personen Bilder in die
-- Ablage „profilbilder“ legen und ersetzen (Einstellungen → Nutzer, Klick
-- auf das Bild). Bisher lud jede Person nur ihr eigenes Bild hoch.
-- Nur nötig, wenn beim Setzen eines Bilds durch den Admin die Meldung
-- „new row violates row-level security policy“ kommt.
-- Gefahrlos mehrfach ausführbar.

drop policy if exists "profilbilder admin schreibt" on storage.objects;
create policy "profilbilder admin schreibt" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profilbilder' and public.bin_admin());

drop policy if exists "profilbilder admin aendert" on storage.objects;
create policy "profilbilder admin aendert" on storage.objects
  for update to authenticated
  using (bucket_id = 'profilbilder' and public.bin_admin())
  with check (bucket_id = 'profilbilder' and public.bin_admin());

notify pgrst, 'reload schema';

-- Probe
select case when count(*) = 2 then 'ok' else 'FEHLT' end as profilbilder_admin
from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('profilbilder admin schreibt', 'profilbilder admin aendert');
