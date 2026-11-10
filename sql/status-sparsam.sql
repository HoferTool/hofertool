-- =================================================================
--  STATUS SPARSAM SCHREIBEN  (seit 1.481.0, 10. November 2026)
--
--  Was diese Datei macht:
--  Die Programme am Pool-Rechner (Drucken, Keyence, Zeichnungen,
--  Einrichtblätter, Pool, NC) schreiben ihren Stand alle ein bis fünf
--  Minuten nach app_config (Schlüssel ..._status), auch wenn sich ausser
--  der Uhrzeit nichts geändert hat. Die grössten Stände sind über
--  150 KB gross. Das waren rund 40 % aller Schreibvorgänge der
--  Datenbank, und Supabase warnte wegen des Festplatten-Budgets
--  (Disk IO Budget).
--
--  Neu: Ein Auslöser vergleicht den neuen Stand mit dem alten, ohne die
--  Zeitfelder "zeit" und "gesehen". Ist er gleich und der alte höchstens
--  10 Minuten alt, wird nichts geschrieben. So bleibt "zuletzt gesehen"
--  höchstens 10 Minuten alt (Systemzustand meldet erst ab 15 bzw. 30
--  Minuten), und jede echte Änderung kommt sofort an.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok/FEHLT.
-- =================================================================

create or replace function public.app_config_status_sparsam()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  alt jsonb;
  neu jsonb;
  t   timestamptz;
begin
  if new.schluessel is null or new.schluessel not like '%\_status' escape '\' then
    return new;
  end if;
  begin
    alt := old.wert::jsonb;
    neu := new.wert::jsonb;
  exception when others then
    return new;   -- kein JSON: normal schreiben
  end;
  if jsonb_typeof(alt) <> 'object' or jsonb_typeof(neu) <> 'object' then
    return new;
  end if;
  if (alt - 'zeit' - 'gesehen') is distinct from (neu - 'zeit' - 'gesehen') then
    return new;   -- echte Änderung
  end if;
  begin
    t := greatest(nullif(alt->>'gesehen', '')::timestamptz, nullif(alt->>'zeit', '')::timestamptz);
  exception when others then
    return new;
  end;
  if t is null or t < now() - interval '10 minutes' then
    return new;   -- Lebenszeichen alle 10 Minuten
  end if;
  return null;    -- nichts Neues: nicht schreiben
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'app_config_status_sparsam'
                 and tgrelid = 'public.app_config'::regclass) then
    create trigger app_config_status_sparsam
      before update on public.app_config
      for each row execute function public.app_config_status_sparsam();
  end if;
end $$;

notify pgrst, 'reload schema';

select 'Status sparsam schreiben' as was,
       case when exists (select 1 from pg_trigger where tgname = 'app_config_status_sparsam')
            then 'ok' else 'FEHLT' end as probe;
