-- =================================================================
--  AUSSCHUSS BLEIBT FÜR DIE STATISTIK (1.186.1, Patrick 26. Oktober 2026:
--  „die Ausschusswerte in der Statistik waren heute wieder weg“)
--  Bisher galt ein Löschen in qs_meldungen nur als Quittieren, wenn die
--  App vorher quittiert_am gesetzt hatte; sonst nahm der Auslöser die
--  Menge auch aus qs_ausschuss weg (gedacht für Rückgängig einer falschen
--  Meldung). Die iPads an den Maschinen liefen noch mit einer Fassung von
--  vor 1.159.0 und löschten beim Quittieren ohne quittiert_am: so war der
--  Ausschuss jedes Mal auch für die Statistik weg.
--  Diese Datei
--    1. gibt qs_meldungen die Spalte zurueck: nur wenn die App sie vor dem
--       Löschen setzt (Rückgängig von „Ausschuss melden“), verschwindet
--       die Menge auch aus qs_ausschuss
--    2. jedes andere Löschen gilt jetzt als Quittieren, egal welche
--       Fassung der App es schickt: die Menge bleibt
--    3. qs_ausschuss_nachtragen: holt verlorene Meldungen aus den
--       täglichen Sicherungen zurück (macht das Sicherungsgerät einmal
--       von selbst, nur Admins und Planwand), vorhandene bleiben
--  Gefahrlos mehrfach ausführbar, ohne drop. Am Ende eine Probe.
-- =================================================================

alter table public.qs_meldungen add column if not exists zurueck boolean not null default false;

create or replace function public.qs_ausschuss_merken()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.qs_ausschuss (id, job_id, machine_id, hoco_nr, stueck, notiz, erstellt_am, erstellt_von, erstellt_name)
    values (new.id, new.job_id, new.machine_id, new.hoco_nr, new.stueck, new.notiz, new.erstellt_am, new.erstellt_von, new.erstellt_name)
    on conflict (id) do update set stueck = excluded.stueck, notiz = excluded.notiz,
      quittiert_am = null, quittiert_von = null;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.qs_ausschuss set stueck = new.stueck, notiz = new.notiz, hoco_nr = new.hoco_nr,
      quittiert_am = new.quittiert_am,
      quittiert_von = case when new.quittiert_am is null then null else coalesce(auth.uid(), quittiert_von) end
    where id = new.id;
    return new;
  else
    if old.zurueck then
      -- Rückgängig einer falschen Meldung: auch in der Statistik weg
      delete from public.qs_ausschuss where id = old.id;
    else
      -- Quittiert, auch ohne quittiert_am (ältere Fassungen der App)
      update public.qs_ausschuss set quittiert_am = coalesce(old.quittiert_am, quittiert_am, now()),
        quittiert_von = coalesce(quittiert_von, auth.uid())
      where id = old.id;
    end if;
    return old;
  end if;
end $$;

-- Verlorene Meldungen aus einer Sicherung nachtragen. p_zeilen sind Zeilen
-- aus tabellen/qs_meldungen.json oder qs_ausschuss.json; was es schon gibt
-- (oder gerade offen ist), bleibt. p_fertig merkt sich, dass es gemacht ist.
create or replace function public.qs_ausschuss_nachtragen(p_zeilen jsonb, p_fertig boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  if not (public.bin_admin() or public.bin_planwand()) then
    raise exception 'Nur Admins und Planwand dürfen Ausschuss nachtragen.';
  end if;
  insert into public.qs_ausschuss (id, job_id, machine_id, hoco_nr, stueck, notiz, erstellt_am, erstellt_von, erstellt_name,
    quittiert_am, quittiert_von)
  select z.id,
    case when exists (select 1 from public.jobs j where j.id = z.job_id) then z.job_id end,
    z.machine_id, z.hoco_nr, z.stueck, z.notiz, coalesce(z.erstellt_am, now()),
    case when exists (select 1 from public.profiles p where p.id = z.erstellt_von) then z.erstellt_von end,
    z.erstellt_name, coalesce(z.quittiert_am, now()),
    case when exists (select 1 from public.profiles p where p.id = z.quittiert_von) then z.quittiert_von end
  from jsonb_to_recordset(coalesce(p_zeilen, '[]'::jsonb)) as z(id uuid, job_id uuid, machine_id uuid, hoco_nr text,
    stueck integer, notiz text, erstellt_am timestamptz, erstellt_von uuid, erstellt_name text,
    quittiert_am timestamptz, quittiert_von uuid, zurueck boolean)
  where z.id is not null and z.stueck is not null and not coalesce(z.zurueck, false)
    and exists (select 1 from public.machines m where m.id = z.machine_id)
    and not exists (select 1 from public.qs_meldungen q where q.id = z.id)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  if p_fertig then
    insert into public.app_config (schluessel, wert) values ('qs_ausschuss_nachgeholt', now()::text)
    on conflict (schluessel) do update set wert = excluded.wert;
  end if;
  return n;
end $$;

grant execute on function public.qs_ausschuss_nachtragen(jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte zurueck' as punkt,
       case when exists (select 1 from information_schema.columns where table_name = 'qs_meldungen'
                         and column_name = 'zurueck') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Löschen gilt als Quittieren',
       case when pg_get_functiondef('public.qs_ausschuss_merken'::regproc) like '%old.zurueck%' then 'ok' else 'FEHLT' end
union all
select 'Nachtragen',
       case when to_regprocedure('public.qs_ausschuss_nachtragen(jsonb, boolean)') is not null then 'ok' else 'FEHLT' end;
