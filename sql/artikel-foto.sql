-- =================================================================
--  ARTIKEL PER FOTO ERKENNEN
--
--  Bei „Neue Bestellposition“ kann man die Verpackung eines Artikels
--  fotografieren (Wunsch Patrick 19. Oktober 2026). Die App liest den
--  Text und sucht den passenden Artikel. Damit sie mit der Zeit
--  besser wird, merkt sie sich zu jedem Artikel, was auf seiner
--  Verpackung steht (Codes, Nummern, Strichcode).
--
--  Was das Skript macht:
--   - articles.foto_merkmale: gelernte Merkmale der Verpackung
--   - articles.foto_bilder: Beispielfotos der Verpackung (Liste mit
--     Adresse, Pfad, wann, wer); die Fotos liegen in der Ablage
--     „zeichnungen“ im Ordner „artikel/“
--   - die Sicht artikel_uebersicht zeigt dazu foto_anzahl
--  Rechte wie bei den Artikeln bisher, nichts Neues.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine
--  Probe mit ok / FEHLT.
-- =================================================================

alter table public.articles add column if not exists foto_merkmale text[] not null default '{}';
alter table public.articles add column if not exists foto_bilder jsonb not null default '[]'::jsonb;

-- Die Artikelliste zeigt, wie viele Beispielfotos ein Artikel hat
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
    jsonb_array_length(a.foto_bilder) AS foto_anzahl
   FROM ((articles a
     LEFT JOIN suppliers s ON ((s.id = a.supplier_id)))
     LEFT JOIN stock_balances b ON ((b.article_id = a.id)))
  GROUP BY a.id, s.name, s.website;

notify pgrst, 'reload schema';

select case when count(*) = 2 then 'ok' else 'FEHLT' end as probe
from information_schema.columns
where table_schema = 'public' and table_name = 'articles'
  and column_name in ('foto_merkmale', 'foto_bilder')
  and exists (select 1 from information_schema.columns where table_name = 'artikel_uebersicht' and column_name = 'foto_anzahl');
