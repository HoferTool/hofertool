-- =================================================================
--  MENÜPLAN IM PAUSENRAUM
--  Das Menü je Tag (Tschanz's Menüplan) steht in einer eigenen Zeile
--  „menueplan“ der Tabelle infoboard. Diese Datei erlaubt allen ausser
--  Externen, diese Zeile anzulegen und zu ändern (lesen dürfen sie
--  das Infoboard schon). Gefahrlos mehrfach ausführbar.
-- =================================================================
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'infoboard' and policyname = 'menueplan anlegen alle') then
    create policy "menueplan anlegen alle" on public.infoboard for insert
      with check (id = 'menueplan' and (select darf_lesen()) and not (select ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'infoboard' and policyname = 'menueplan aendern alle') then
    create policy "menueplan aendern alle" on public.infoboard for update
      using (id = 'menueplan' and (select darf_lesen()) and not (select ist_extern()))
      with check (id = 'menueplan' and (select darf_lesen()) and not (select ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

select case when count(*) = 2 then 'ok' else 'FEHLT' end as probe
from pg_policies where tablename = 'infoboard' and policyname in ('menueplan anlegen alle', 'menueplan aendern alle');
