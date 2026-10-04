-- =================================================================
--  LOGO FÜR LIEFERANTEN
--
--  Eine Spalte an den Lieferanten für ein eigenes Logo. Ohne diese
--  Spalte zeigt die App automatisch das Symbol der Website des
--  Lieferanten. Mit ihr kann man unter Bestellungen → Lieferanten
--  (Tipp aufs Logo) ein eigenes Bild wählen oder das Logo ausschalten.
--
--  Inhalt: leer = automatisch, "keins" = nur Buchstaben, sonst das
--  Bild (Adresse oder das verkleinerte Bild selbst).
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

alter table public.suppliers add column if not exists logo_url text;

notify pgrst, 'reload schema';

select 'suppliers.logo_url' as punkt,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'suppliers'
                           and column_name = 'logo_url')
            then 'ok' else 'FEHLT' end as ergebnis;
