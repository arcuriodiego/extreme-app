-- Recibos numerados, cobro de varias cuotas juntas, datos para transferir y
-- recordatorios de cuota por WhatsApp (pedido de Diego, 10 nov).
--
-- - Cada recibo tiene un número correlativo por academia y un código privado (token)
--   para abrirlo desde un link sin iniciar sesión (se manda por WhatsApp).
-- - Un recibo agrupa uno o varios pagos: si una familia paga dos cuotas juntas, sale
--   un solo recibo; si las paga por separado, sale uno por cada pago.
-- - Los mensajes de WhatsApp se arman en la app (wa.me): no hace falta la API paga.

-- ---------------------------------------------------------------------
-- Datos para transferir (se muestran a alumnos, en recordatorios y en recibos)
-- ---------------------------------------------------------------------

alter table public.academies
  add column transfer_alias  text check (transfer_alias is null or transfer_alias ~ '^[A-Za-z0-9.-]{6,20}$'),
  add column transfer_cbu    text check (transfer_cbu is null or transfer_cbu ~ '^[0-9]{22}$'),
  add column transfer_holder text check (transfer_holder is null or length(transfer_holder) between 1 and 80),
  add column transfer_bank   text check (transfer_bank is null or length(transfer_bank) between 1 and 60);

create or replace function public.update_transfer_info(p_alias text, p_cbu text, p_holder text, p_bank text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.current_academy_id();
begin
  if v_academy is null or not public.has_permission('settings.manage') then
    raise exception 'Sólo administración puede cambiar los datos para transferir.' using errcode = '42501';
  end if;
  update public.academies
     set transfer_alias  = nullif(trim(coalesce(p_alias, '')), ''),
         transfer_cbu    = nullif(regexp_replace(coalesce(p_cbu, ''), '[^0-9]', '', 'g'), ''),
         transfer_holder = nullif(trim(coalesce(p_holder, '')), ''),
         transfer_bank   = nullif(trim(coalesce(p_bank, '')), '')
   where id = v_academy;
end;
$$;

-- ---------------------------------------------------------------------
-- Recibos
-- ---------------------------------------------------------------------

create table public.receipts (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete restrict,
  number      integer not null check (number > 0),
  token       text not null unique check (length(token) between 20 and 64),
  issued_at   timestamptz not null default now(),
  issued_by   uuid default public.current_actor_id(),
  unique (academy_id, number),
  unique (academy_id, id)
);

alter table public.payments
  add column receipt_id uuid,
  add foreign key (academy_id, receipt_id) references public.receipts (academy_id, id) on delete restrict;

create index payments_receipt_idx on public.payments (receipt_id) where receipt_id is not null;

alter table public.receipts enable row level security;

-- El personal que cobra ve los recibos; alumnos y tutores, los de sus propios pagos.
create policy "Recibos de mis pagos, o todos si cobro" on public.receipts
  for select to authenticated
  using (
    academy_id = public.current_academy_id()
    and (public.has_permission('payments.register') or public.has_permission('finance.view')
         or exists (select 1 from public.payments p where p.receipt_id = receipts.id))
  );

-- Emite un recibo para uno o varios pagos (de la misma academia, vigentes y sin recibo).
create or replace function public.issue_receipt(p_payment_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_ids uuid[] := array(select distinct unnest(p_payment_ids));
  v_found integer;
  v_existing uuid[];
  v_number integer;
  v_receipt uuid;
begin
  if coalesce(array_length(v_ids, 1), 0) = 0 or array_length(v_ids, 1) > 20 then
    raise exception 'Elegí entre 1 y 20 pagos.' using errcode = '22023';
  end if;
  select count(*), array_agg(distinct receipt_id) filter (where receipt_id is not null)
    into v_found, v_existing
    from public.payments
   where id = any(v_ids) and academy_id = v_academy and status = 'approved';
  if v_found <> array_length(v_ids, 1) then
    raise exception 'Algún pago no existe o está anulado.' using errcode = 'P0002';
  end if;
  if v_existing is not null then
    -- Todos ya comparten el mismo recibo: se devuelve ese.
    if array_length(v_existing, 1) = 1
       and not exists (select 1 from public.payments where id = any(v_ids) and receipt_id is null) then
      return v_existing[1];
    end if;
    raise exception 'Alguno de esos pagos ya tiene recibo.' using errcode = '23505';
  end if;

  -- Numeración correlativa por academia (se bloquea la academia para no repetir número).
  perform 1 from public.academies where id = v_academy for update;
  select coalesce(max(number), 0) + 1 into v_number from public.receipts where academy_id = v_academy;
  insert into public.receipts (academy_id, number, token)
  values (v_academy, v_number, encode(gen_random_bytes(18), 'hex')) returning id into v_receipt;
  update public.payments set receipt_id = v_receipt where id = any(v_ids);
  return v_receipt;
end;
$$;

-- El recibo de un pago: el que ya tiene o uno nuevo.
create or replace function public.receipt_for_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_receipt uuid;
begin
  select receipt_id into v_receipt from public.payments where id = p_payment_id and academy_id = v_academy;
  if not found then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  return coalesce(v_receipt, public.issue_receipt(array[p_payment_id]));
end;
$$;

-- Cobrar varias cuotas juntas (por ejemplo, de hermanos) con un solo recibo.
-- Cada cuota se cobra completa por "lo que corresponda" según el medio (efectivo o no).
create or replace function public.pay_charges(p_charge_ids uuid[], p_method text, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.require_payments_register();
  v_charge uuid;
  v_payments uuid[] := '{}';
begin
  if coalesce(array_length(p_charge_ids, 1), 0) = 0 or array_length(p_charge_ids, 1) > 20 then
    raise exception 'Elegí entre 1 y 20 cuotas.' using errcode = '22023';
  end if;
  for v_charge in
    select c.id from public.charges c
     where c.id = any(p_charge_ids) and c.academy_id = v_academy
     order by c.due_date, c.id
  loop
    v_payments := v_payments || public.record_payment(v_academy, v_charge, null, p_method, p_reference);
  end loop;
  if coalesce(array_length(v_payments, 1), 0) <> (select count(distinct x) from unnest(p_charge_ids) x) then
    raise exception 'Alguna cuota no existe.' using errcode = 'P0002';
  end if;
  return public.issue_receipt(v_payments);
end;
$$;

-- Lo que muestra el link público del recibo (sin sesión, sólo con el código).
create or replace function public.receipt_view(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'academy', a.name,
    'timezone', a.timezone,
    'number', r.number,
    'issued_at', r.issued_at,
    'void', exists (select 1 from public.payments p where p.receipt_id = r.id and p.status = 'void'),
    'total_cents', coalesce((select sum(p.amount_cents) from public.payments p where p.receipt_id = r.id and p.status = 'approved'), 0),
    'methods', coalesce((select jsonb_agg(distinct p.method) from public.payments p where p.receipt_id = r.id), '[]'::jsonb),
    'reference', (select string_agg(distinct p.reference, ' · ') from public.payments p where p.receipt_id = r.id and p.reference is not null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'student', trim(s.first_name || ' ' || s.last_name),
               'description', c.description,
               'amount_cents', al.amount_cents)
             order by s.first_name, c.due_date)
        from public.payments p
        join public.payment_allocations al on al.payment_id = p.id
        join public.charges c on c.id = al.charge_id
        join public.students s on s.id = p.student_id
       where p.receipt_id = r.id
    ), '[]'::jsonb)
  )
  from public.receipts r
  join public.academies a on a.id = r.academy_id
  where length(coalesce(p_token, '')) between 20 and 64 and r.token = p_token;
$$;

-- ---------------------------------------------------------------------
-- Recordatorios de cuota por WhatsApp (registro de los enviados)
-- ---------------------------------------------------------------------

create table public.fee_reminders (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete restrict,
  family_key  text not null check (length(family_key) between 1 and 80),
  charge_ids  uuid[] not null,
  sent_at     timestamptz not null default now(),
  sent_by     uuid default public.current_actor_id()
);

create index fee_reminders_family_idx on public.fee_reminders (academy_id, family_key, sent_at desc);

alter table public.fee_reminders enable row level security;

create policy "Recordatorios: quien cobra" on public.fee_reminders
  for select to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('payments.register'));

create or replace function public.log_fee_reminder(p_family_key text, p_charge_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_academy uuid := public.require_payments_register();
begin
  if coalesce(array_length(p_charge_ids, 1), 0) = 0
     or exists (select 1 from unnest(p_charge_ids) x
                where not exists (select 1 from public.charges c where c.id = x and c.academy_id = v_academy)) then
    raise exception 'Alguna cuota no existe.' using errcode = 'P0002';
  end if;
  insert into public.fee_reminders (academy_id, family_key, charge_ids)
  values (v_academy, left(p_family_key, 80), p_charge_ids);
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------

revoke all on function public.update_transfer_info(text, text, text, text) from public, anon;
revoke all on function public.issue_receipt(uuid[]) from public, anon;
revoke all on function public.receipt_for_payment(uuid) from public, anon;
revoke all on function public.pay_charges(uuid[], text, text) from public, anon;
revoke all on function public.log_fee_reminder(text, uuid[]) from public, anon;
grant execute on function public.update_transfer_info(text, text, text, text) to authenticated;
grant execute on function public.issue_receipt(uuid[]) to authenticated;
grant execute on function public.receipt_for_payment(uuid) to authenticated;
grant execute on function public.pay_charges(uuid[], text, text) to authenticated;
grant execute on function public.log_fee_reminder(text, uuid[]) to authenticated;

-- El link del recibo se abre sin sesión: sólo devuelve datos con el código exacto.
revoke all on function public.receipt_view(text) from public;
grant execute on function public.receipt_view(text) to anon, authenticated;

grant select on public.receipts, public.fee_reminders to authenticated;
