-- =====================================================================
-- Entrega 22 · Notificaciones al celular (Web Push).
--
-- Cada celular o computadora donde la persona activa las notificaciones
-- guarda su suscripción. Los avisos (la campanita) se mandan también como
-- notificación, igual que por email: después de responder cada pantalla,
-- de a tandas, con la clave VAPID que vive sólo en el servidor (Vercel).
-- Sin una clave VAPID privada, nadie puede mandar notificaciones a estas
-- suscripciones aunque conozca su dirección.
-- =====================================================================

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete restrict,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh        text not null check (length(p256dh) between 20 and 200),
  auth          text not null check (length(auth) between 8 and 100),
  user_agent    text check (length(user_agent) <= 300),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
grant select on public.push_subscriptions to authenticated;

create policy "Mis suscripciones" on public.push_subscriptions
  for select to authenticated using (profile_id = (select auth.uid()));

-- Guardar (o pasar a esta cuenta, si el celular lo usaba otra persona).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null or auth.uid() is null then
    raise exception 'Iniciá sesión.' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (academy_id, profile_id, endpoint, p256dh, auth, user_agent)
  values (v_academy, auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, academy_id = excluded.academy_id,
        p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
$$;

-- Estado del envío por notificación (los avisos anteriores no se mandan).
alter table public.notifications
  add column push_status text not null default 'pending'
    check (push_status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  add column pushed_at timestamptz;
update public.notifications set push_status = 'skipped';

-- Toma una tanda de avisos para mandar al celular, con las suscripciones de cada destinatario.
-- Mismo alcance que los emails: el personal despacha los de todos; cada uno, los suyos.
create or replace function public.claim_notification_pushes(p_limit integer default 50)
returns table (notification_id uuid, title text, body text, link text, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_all boolean := public.has_permission('people.view');
begin
  if v_academy is null then return; end if;

  -- Quien no tiene ninguna suscripción no recibe notificaciones (sigue la campanita).
  update public.notifications n set push_status = 'skipped'
   where n.academy_id = v_academy and n.push_status = 'pending'
     and (v_all or n.recipient_id = auth.uid())
     and not exists (select 1 from public.push_subscriptions s where s.profile_id = n.recipient_id);

  return query
  with picked as (
    select n.id from public.notifications n
    where n.academy_id = v_academy
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

-- Resultado de la tanda; las suscripciones vencidas (el servicio contestó 404/410) se borran.
create or replace function public.finish_notification_pushes(p_sent uuid[], p_failed uuid[], p_gone text[])
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
  update public.notifications n set push_status = 'sent', pushed_at = now()
   where n.id = any (coalesce(p_sent, '{}')) and n.academy_id = v_academy and n.push_status = 'sending'
     and (v_all or n.recipient_id = auth.uid());
  update public.notifications n set push_status = 'failed'
   where n.id = any (coalesce(p_failed, '{}')) and n.academy_id = v_academy and n.push_status = 'sending'
     and (v_all or n.recipient_id = auth.uid());
  delete from public.push_subscriptions s
   where s.endpoint = any (coalesce(p_gone, '{}')) and s.academy_id = v_academy
     and (v_all or s.profile_id = auth.uid());
  update public.push_subscriptions s set last_used_at = now()
   where s.academy_id = v_academy and s.last_used_at is distinct from now()
     and s.profile_id in (select n.recipient_id from public.notifications n where n.id = any (coalesce(p_sent, '{}')));
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
revoke all on function public.claim_notification_pushes(integer) from public, anon;
revoke all on function public.finish_notification_pushes(uuid[], uuid[], text[]) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.claim_notification_pushes(integer) to authenticated;
grant execute on function public.finish_notification_pushes(uuid[], uuid[], text[]) to authenticated;
