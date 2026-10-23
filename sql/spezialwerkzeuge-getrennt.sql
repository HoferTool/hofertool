-- =================================================================
--  SPEZIALWERKZEUGE GETRENNT VON DEN BESTELLUNGEN
--
--  Wunsch Patrick 22. Oktober 2026: Spezialwerkzeuge sollen ganz für
--  sich stehen. Ihre Artikel und Bestellungen (offen, bestellt,
--  geliefert) sieht man nur noch unter Bestellungen →
--  Spezialwerkzeuge, nicht mehr bei den normalen Bestellungen. Die
--  Lieferanten bleiben gemeinsam.
--
--  Was das Skript macht:
--   - neue Spalte articles.spezial (ja/nein): dieser Artikel ist ein
--     Spezialwerkzeug
--   - alle Artikel, die schon einer HOCO Nr. zugeordnet sind, werden
--     Spezialwerkzeuge (samt ihren Bestellungen)
--   - die Sicht artikel_uebersicht zeigt die Spalte mit
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

alter table public.articles add column if not exists spezial boolean not null default false;

update public.articles a set spezial = true
 where not a.spezial
   and exists (select 1 from public.spezialwerkzeuge z where z.article_id = a.id);

create or replace view public.artikel_uebersicht with (security_invoker = true) as
 SELECT a.id,
    a.article_number,
    a.name,
    a.description,
    a.unit,
    a.min_stock,
    a.is_active,
    a.supplier_id,
    s.name AS supplier_name,
    s.website AS supplier_website,
    (COALESCE(sum(b.quantity), (0)::bigint))::integer AS gesamtbestand,
    (COALESCE(sum(b.quantity), (0)::bigint) < a.min_stock) AS unter_mindestbestand,
    jsonb_array_length(a.foto_bilder) AS foto_anzahl,
    a.spezial
   FROM ((articles a
     LEFT JOIN suppliers s ON ((s.id = a.supplier_id)))
     LEFT JOIN stock_balances b ON ((b.article_id = a.id)))
  GROUP BY a.id, s.name, s.website;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte articles.spezial' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'articles' and column_name = 'spezial') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Sicht artikel_uebersicht mit spezial',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'artikel_uebersicht' and column_name = 'spezial') then 'ok' else 'FEHLT' end;
