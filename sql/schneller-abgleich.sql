-- =================================================================
--  SCHNELLERER ABGLEICH
--
--  Jede offene App fragt alle 45 Sekunden nach, ob sich etwas
--  geändert hat. Bisher lud sie dafür ganze Tabellen herunter — in der
--  Produktion alle Zählerstände seit Beginn. Die werden jeden Tag mehr,
--  und die App wurde mit der Zeit träger.
--
--  Mit dieser Funktion rechnet die Datenbank selbst einen kurzen
--  Fingerabdruck der Tabellen aus und schickt nur diesen zurück:
--  32 Zeichen statt Megabytes.
--
--  Die Funktion liest mit den Rechten der angemeldeten Person —
--  Externe bekommen den Fingerabdruck nur ihrer eigenen Daten.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

create or replace function public.stempel(tabellen text[])
returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  t text;
  teil text;
  alle text := '';
begin
  foreach t in array tabellen loop
    -- nur echte Tabellen und Sichten im öffentlichen Bereich
    if to_regclass('public.' || t) is null then continue; end if;
    begin
      execute format(
        'select coalesce(md5(string_agg(md5(x::text), '''' order by md5(x::text))), '''') from public.%I x', t)
        into teil;
    exception when others then
      teil := 'x';          -- keine Leserechte: zählt als unverändert
    end;
    alle := alle || t || ':' || teil || ';';
  end loop;
  return md5(alle);
end $$;

grant execute on function public.stempel(text[]) to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Fingerabdruck der Planwand' as punkt,
       public.stempel(array['jobs', 'vacations', 'production_records']) as ergebnis;
