-- Material: Menge „ca.“ (geschätzt)
--
-- Wer Restmaterial erfasst und die Menge nur schätzen kann, setzt im
-- Fenster „Material erfassen“ das Häkchen „ca. (geschätzt)“. Die App
-- zeigt die Menge dann überall mit „ca.“ davor (Wunsch Patrick
-- 22. Oktober 2026: „bei Material soll auch ca. möglich sein, wenn man
-- schätzen muss“).
--
-- Diese Datei
--   * ergänzt bei material_posten und material_verlauf die Spalte „ca“
--     (ja/nein, Vorgabe nein),
--   * schreibt „ca.“ in der Historie mit, auch wenn nur das Häkchen
--     geändert wird.
-- Gefahrlos mehrfach ausführbar, ohne „drop“.

alter table public.material_posten add column if not exists ca boolean not null default false;
alter table public.material_verlauf add column if not exists ca boolean not null default false;

create or replace function public.material_verlauf_schreiben() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := '';
begin
  if tg_op = 'INSERT' then
    insert into material_verlauf (posten_id, was, material, menge, einheit, ort, ca, wer)
      values (new.id, 'erfasst', new.material, new.menge, new.einheit, new.ort, new.ca, auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into material_verlauf (posten_id, was, material, menge, einheit, ort, ca, wer)
      values (old.id, 'geloescht', old.material, old.menge, old.einheit, old.ort, old.ca, auth.uid());
    return old;
  end if;
  if new.weg_am is not null and old.weg_am is null then
    insert into material_verlauf (posten_id, was, material, menge, einheit, ort, ca, wer)
      values (new.id, 'aufgebraucht', new.material, new.menge, new.einheit, new.ort, new.ca, auth.uid());
  elsif new.weg_am is null and old.weg_am is not null then
    insert into material_verlauf (posten_id, was, material, menge, einheit, ort, ca, wer)
      values (new.id, 'zurueck', new.material, new.menge, new.einheit, new.ort, new.ca, auth.uid());
  else
    if new.material is distinct from old.material then v := v || 'Material ' || coalesce(old.material, '–') || '; '; end if;
    if new.menge is distinct from old.menge or new.einheit is distinct from old.einheit
       or new.ca is distinct from old.ca then
      v := v || 'Menge ' || case when old.ca then 'ca. ' else '' end
        || coalesce(trim(trailing '.' from trim(trailing '0' from old.menge::text)) || ' ' || coalesce(old.einheit, ''), '–') || '; ';
    end if;
    if new.ort is distinct from old.ort then v := v || 'Ort ' || coalesce(old.ort, '–') || '; '; end if;
    if new.notiz is distinct from old.notiz then v := v || 'Notiz ' || coalesce(old.notiz, '–') || '; '; end if;
    if new.platz is distinct from old.platz or new.job_id is distinct from old.job_id then v := v || 'Zuweisung geändert; '; end if;
    if v <> '' then
      insert into material_verlauf (posten_id, was, material, menge, einheit, ort, ca, vorher, wer)
        values (new.id, 'geaendert', new.material, new.menge, new.einheit, new.ort, new.ca, rtrim(v, '; '), auth.uid());
    end if;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';

-- Probe: zeigt ok oder FEHLT
select case when (select count(*) from information_schema.columns
  where table_schema = 'public' and column_name = 'ca'
    and table_name in ('material_posten', 'material_verlauf')) = 2
  and (select prosrc like '%new.ca%' from pg_proc where proname = 'material_verlauf_schreiben')
  then 'ok' else 'FEHLT' end as probe;
