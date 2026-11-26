-- Prüfmittelverwaltung für alle (seit 1.871.0, Wunsch Patrick 26. November 2026:
-- „den Rest bei QS kannst du für alle öffnen“).
-- Bisher durften nur Admins die Prüfmittel sehen und ändern. Diese Datei
-- erlaubt es allen angemeldeten Personen ausser Externen und dem Dienstkonto.
-- Die Regeln für Admins bleiben daneben bestehen. Gefahrlos mehrfach ausführbar.

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pruefmittel' and policyname = 'pruefmittel alle') then
    create policy "pruefmittel alle" on public.pruefmittel for all to authenticated
      using ((select darf_lesen()) and not (select ist_extern())
             and coalesce((select role from public.profiles where id = (select auth.uid())), '') <> 'dienst')
      with check ((select darf_lesen()) and not (select ist_extern())
             and coalesce((select role from public.profiles where id = (select auth.uid())), '') <> 'dienst');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pruefmittel_verlauf' and policyname = 'pruefmittel verlauf alle') then
    create policy "pruefmittel verlauf alle" on public.pruefmittel_verlauf for all to authenticated
      using ((select darf_lesen()) and not (select ist_extern())
             and coalesce((select role from public.profiles where id = (select auth.uid())), '') <> 'dienst')
      with check ((select darf_lesen()) and not (select ist_extern())
             and coalesce((select role from public.profiles where id = (select auth.uid())), '') <> 'dienst');
  end if;
end $$;

notify pgrst, 'reload schema';

select case when count(*) = 2 then 'ok' else 'FEHLT' end as probe
from pg_policies where policyname in ('pruefmittel alle', 'pruefmittel verlauf alle');
