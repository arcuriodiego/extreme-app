-- =====================================================================
-- Aviso diario automático.
--
-- Hasta ahora los avisos del día (vencimientos de cuota, packs por vencer)
-- se generaban cuando alguien abría la app. Ahora, además, una tarea
-- programada de Vercel llama todos los días a la app (/api/cron/avisos),
-- que con la clave de servicio de Supabase (sólo en el servidor):
--   1. genera las cuotas y los avisos del día de todas las academias;
--   2. manda por email y al celular los pendientes.
-- Las funciones de despacho aceptan, además del personal, una llamada de servicio.
-- =====================================================================

-- ¿La llamada viene con la clave de servicio? (rol service_role de la API)
create or replace function public.is_service_call()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or coalesce(current_setting('role', true), '') = 'service_role';
$$;

-- Genera las cuotas y los avisos del día de todas las academias (una vez por día cada una).
create or replace function public.cron_daily_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  a record;
begin
  if not public.is_service_call() then
    raise exception 'Sólo la tarea programada puede generar los avisos de todas las academias.' using errcode = '42501';
  end if;
  for a in select id from public.academies loop
    continue when exists (select 1 from public.notification_runs
                          where academy_id = a.id and ran_on >= public.academy_today(a.id));
    perform public.generate_membership_charges(a.id);
    v_total := v_total + public.generate_notifications(a.id);
  end loop;
  return v_total;
end;
$$;

-- Emails: mismo despacho, con alcance total para la llamada de servicio.
create or replace function public.claim_notification_emails(p_limit integer default 50)
returns table (id uuid, email text, first_name text, title text, body text, link text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := public.is_service_call();
  v_academy uuid := public.current_academy_id();
  v_all boolean := v_service or public.has_permission('people.view');
begin
  if v_academy is null and not v_service then return; end if;

  update public.notifications n set email_status = 'skipped'
   where (v_service or n.academy_id = v_academy) and n.email_status = 'pending'
     and (v_all or n.recipient_id = auth.uid())
     and not exists (select 1 from public.profiles p where p.id = n.recipient_id and p.email is not null and p.email <> '');

  return query
  with picked as (
    select n.id from public.notifications n
    where (v_service or n.academy_id = v_academy)
      and (v_all or n.recipient_id = auth.uid())
      and n.created_at > now() - interval '48 hours'
      and (n.email_status = 'pending'
           or (n.email_status = 'sending' and n.emailed_at < now() - interval '15 minutes'))
    order by n.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    for update skip locked
  ), marked as (
    update public.notifications n set email_status = 'sending', emailed_at = now()
    from picked where n.id = picked.id
    returning n.id, n.recipient_id, n.title, n.body, n.link
  )
  select m.id, p.email, p.first_name, m.title, m.body, m.link
  from marked m join public.profiles p on p.id = m.recipient_id;
end;
$$;

create or replace function public.finish_notification_emails(p_sent uuid[], p_failed uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := public.is_service_call();
  v_academy uuid := public.current_academy_id();
  v_all boolean := v_service or public.has_permission('people.view');
begin
  if v_academy is null and not v_service then return; end if;
  update public.notifications n set email_status = 'sent', emailed_at = now()
   where n.id = any (coalesce(p_sent, '{}')) and (v_service or n.academy_id = v_academy) and n.email_status = 'sending'
     and (v_all or n.recipient_id = auth.uid());
  update public.notifications n set email_status = 'failed'
   where n.id = any (coalesce(p_failed, '{}')) and (v_service or n.academy_id = v_academy) and n.email_status = 'sending'
     and (v_all or n.recipient_id = auth.uid());
end;
$$;

-- Notificaciones al celular: ídem.
create or replace function public.claim_notification_pushes(p_limit integer default 50)
returns table (notification_id uuid, title text, body text, link text, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := public.is_service_call();
  v_academy uuid := public.current_academy_id();
  v_all boolean := v_service or public.has_permission('people.view');
begin
  if v_academy is null and not v_service then return; end if;

  update public.notifications n set push_status = 'skipped'
   where (v_service or n.academy_id = v_academy) and n.push_status = 'pending'
     and (v_all or n.recipient_id = auth.uid())
     and not exists (select 1 from public.push_subscriptions s where s.profile_id = n.recipient_id);

  return query
  with picked as (
    select n.id from public.notifications n
    where (v_service or n.academy_id = v_academy)
      and (v_all or n.recipient_id = auth.uid())
      and n.created_at > now() - interval '48 hours'
      and (n.push_status = 'pending'
           or (n.push_status = 'sending' and n.pushed_at < now() - interval '15 minutes'))
    order by n.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    for update skip locked
  ), marked as (
    update public.notifications n set push_status = 'sending', pushed_at = now()
    from picked where n.id = picked.id
    returning n.id, n.recipient_id, n.title, n.body, n.link
  )
  select m.id, m.title, m.body, m.link, s.endpoint, s.p256dh, s.auth
  from marked m join public.push_subscriptions s on s.profile_id = m.recipient_id;
end;
$$;

create or replace function public.finish_notification_pushes(p_sent uuid[], p_failed uuid[], p_gone text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := public.is_service_call();
  v_academy uuid := public.current_academy_id();
  v_all boolean := v_service or public.has_permission('people.view');
begin
  if v_academy is null and not v_service then return; end if;
  update public.notifications n set push_status = 'sent', pushed_at = now()
   where n.id = any (coalesce(p_sent, '{}')) and (v_service or n.academy_id = v_academy) and n.push_status = 'sending'
     and (v_all or n.recipient_id = auth.uid());
  update public.notifications n set push_status = 'failed'
   where n.id = any (coalesce(p_failed, '{}')) and (v_service or n.academy_id = v_academy) and n.push_status = 'sending'
     and (v_all or n.recipient_id = auth.uid());
  delete from public.push_subscriptions s
   where s.endpoint = any (coalesce(p_gone, '{}')) and (v_service or s.academy_id = v_academy)
     and (v_all or s.profile_id = auth.uid());
  update public.push_subscriptions s set last_used_at = now()
   where (v_service or s.academy_id = v_academy) and s.last_used_at is distinct from now()
     and s.profile_id in (select n.recipient_id from public.notifications n where n.id = any (coalesce(p_sent, '{}')));
end;
$$;

revoke all on function public.is_service_call() from public, anon;
grant execute on function public.is_service_call() to authenticated, service_role;
revoke all on function public.cron_daily_notifications() from public, anon, authenticated;
grant execute on function public.cron_daily_notifications() to service_role;
grant execute on function public.claim_notification_emails(integer) to service_role;
grant execute on function public.finish_notification_emails(uuid[], uuid[]) to service_role;
grant execute on function public.claim_notification_pushes(integer) to service_role;
grant execute on function public.finish_notification_pushes(uuid[], uuid[], text[]) to service_role;
