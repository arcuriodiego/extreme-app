-- Avisos también por email (Resend, desde hola@extremedance.com.ar).
--
-- Cada aviso nuevo queda "pendiente de email". La app los toma de a tandas y los manda
-- después de responder (sin demorar las pantallas). Recepción y administración, al usar
-- la app, despachan los de todos; cada alumno o tutor, los suyos.
-- Sólo se mandan avisos de las últimas 48 h (si algo quedó trabado, no se manda viejo).

alter table public.notifications
  add column email_status text not null default 'pending'
    check (email_status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  add column emailed_at timestamptz;

-- Los avisos que ya existían no se mandan por email.
update public.notifications set email_status = 'skipped';

create index notifications_email_pending_idx on public.notifications (academy_id, created_at)
  where email_status in ('pending', 'sending');

-- Toma una tanda de avisos para mandar y los marca "enviando".
create or replace function public.claim_notification_emails(p_limit integer default 50)
returns table (id uuid, email text, first_name text, title text, body text, link text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_all boolean := public.has_permission('people.view');
begin
  if v_academy is null then return; end if;

  -- Sin email no hay nada que mandar.
  update public.notifications n set email_status = 'skipped'
   where n.academy_id = v_academy and n.email_status = 'pending'
     and (v_all or n.recipient_id = auth.uid())
     and not exists (select 1 from public.profiles p where p.id = n.recipient_id and p.email is not null and p.email <> '');

  return query
  with picked as (
    select n.id from public.notifications n
    where n.academy_id = v_academy
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

-- Marca el resultado de la tanda.
create or replace function public.finish_notification_emails(p_sent uuid[], p_failed uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_all boolean := public.has_permission('people.view');
begin
  if v_academy is null then return; end if;
  update public.notifications n set email_status = 'sent', emailed_at = now()
   where n.id = any (coalesce(p_sent, '{}')) and n.academy_id = v_academy and n.email_status = 'sending'
     and (v_all or n.recipient_id = auth.uid());
  update public.notifications n set email_status = 'failed'
   where n.id = any (coalesce(p_failed, '{}')) and n.academy_id = v_academy and n.email_status = 'sending'
     and (v_all or n.recipient_id = auth.uid());
end;
$$;

revoke all on function public.claim_notification_emails(integer) from public, anon;
revoke all on function public.finish_notification_emails(uuid[], uuid[]) from public, anon;
grant execute on function public.claim_notification_emails(integer) to authenticated;
grant execute on function public.finish_notification_emails(uuid[], uuid[]) to authenticated;
