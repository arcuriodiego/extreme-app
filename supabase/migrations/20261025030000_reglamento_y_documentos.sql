-- =====================================================================
-- Entrega 20 · Reglamento y documentos.
--
-- Reglamento: texto con versiones. Lo publica administración (settings.manage).
-- Cada cuenta (alumno adulto o tutor) acepta la versión vigente; queda quién,
-- cuándo y qué versión. Para enviar una inscripción hay que haber aceptado
-- la vigente.
--
-- Documentos: archivos (PDF o imágenes) en el bucket privado "documentos".
-- Los sube recepción o administración (people.manage). Para todos o sólo
-- para el personal; se abren con un enlace temporal.
-- =====================================================================

create table public.regulations (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.academies(id) on delete restrict,
  version       integer not null check (version > 0),
  title         text not null check (length(trim(title)) between 1 and 120),
  body          text not null check (length(trim(body)) between 1 and 30000),
  published_by  uuid references public.profiles(id) on delete set null,
  published_at  timestamptz not null default now(),
  unique (academy_id, version)
);

create table public.regulation_acceptances (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete restrict,
  regulation_id  uuid not null references public.regulations(id) on delete restrict,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  accepted_at    timestamptz not null default now(),
  unique (regulation_id, profile_id)
);

create index regulation_acceptances_profile_idx on public.regulation_acceptances (profile_id);

alter table public.regulations enable row level security;
alter table public.regulation_acceptances enable row level security;
grant select on public.regulations, public.regulation_acceptances to authenticated;

create policy "Reglamento de mi academia" on public.regulations
  for select to authenticated using (academy_id = public.current_academy_id());

create policy "Mis aceptaciones, o todas para el personal" on public.regulation_acceptances
  for select to authenticated
  using (academy_id = public.current_academy_id()
         and (profile_id = (select auth.uid()) or public.has_permission('people.view')));

-- Versión vigente (la última publicada).
create or replace function public.current_regulation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.regulations
   where academy_id = public.current_academy_id()
   order by version desc
   limit 1;
$$;

-- ¿Esta cuenta aceptó la versión vigente? (Si todavía no hay reglamento, no hace falta.)
create or replace function public.regulation_accepted(p_profile uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_regulation_id() is null
      or exists (select 1 from public.regulation_acceptances
                  where regulation_id = public.current_regulation_id()
                    -- Sobre otra cuenta sólo pregunta el personal.
                    and profile_id = coalesce(case when p_profile = auth.uid() or public.has_permission('people.view') then p_profile end, auth.uid()));
$$;

create or replace function public.publish_regulation(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid := public.current_academy_id();
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if v_academy is null or not public.has_permission('settings.manage') then
    raise exception 'No tenés permiso para cambiar el reglamento.' using errcode = '42501';
  end if;
  if length(v_title) not between 1 and 120 then
    raise exception 'Escribí el título.' using errcode = '22023', hint = 'titulo';
  end if;
  if length(v_body) not between 1 and 30000 then
    raise exception 'Escribí el texto del reglamento (hasta 30.000 letras).' using errcode = '22023', hint = 'texto';
  end if;
  perform pg_advisory_xact_lock(hashtext('regulations:' || v_academy::text));
  insert into public.regulations (academy_id, version, title, body, published_by)
  values (v_academy,
          coalesce((select max(version) from public.regulations where academy_id = v_academy), 0) + 1,
          v_title, v_body, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.accept_regulation(p_regulation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión.' using errcode = '42501';
  end if;
  if p_regulation_id is distinct from public.current_regulation_id() then
    raise exception 'El reglamento cambió. Leé la versión nueva.' using errcode = 'P0002', hint = 'reglamento-cambio';
  end if;
  insert into public.regulation_acceptances (academy_id, regulation_id, profile_id)
  values (public.current_academy_id(), p_regulation_id, auth.uid())
  on conflict (regulation_id, profile_id) do nothing;
end;
$$;

-- Para inscribirse hay que haber aceptado el reglamento vigente.
create or replace function public.signup_requires_regulation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.regulation_accepted(new.requested_by) then
    raise exception 'Para inscribirte, leé y aceptá el reglamento.' using errcode = '22023', hint = 'reglamento';
  end if;
  return new;
end;
$$;

create trigger signup_requests_regulation before insert or update of schedule_ids on public.signup_requests
  for each row when (new.status = 'pending')
  execute function public.signup_requires_regulation();

-- ---------------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------------

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null default public.current_academy_id() references public.academies(id) on delete restrict,
  title       text not null check (length(trim(title)) between 1 and 120),
  description text check (length(description) <= 300),
  file_path   text not null unique,
  mime_type   text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes  integer not null check (size_bytes between 1 and 10485760),
  audience    text not null default 'all' check (audience in ('all', 'staff')),
  created_by  uuid default public.current_actor_id() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (file_path ~ '^[0-9a-f-]{36}/documentos/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$' and split_part(file_path, '/', 1) = academy_id::text)
);

alter table public.documents enable row level security;
grant select, insert, delete on public.documents to authenticated;

create policy "Documentos para todos, o todos para el personal" on public.documents
  for select to authenticated
  using (academy_id = public.current_academy_id() and (audience = 'all' or public.has_permission('people.view')));
create policy "Recepción sube documentos" on public.documents
  for insert to authenticated
  with check (academy_id = public.current_academy_id() and public.has_permission('people.manage'));
create policy "Recepción quita documentos" on public.documents
  for delete to authenticated
  using (academy_id = public.current_academy_id() and public.has_permission('people.manage'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Recepción sube archivos de documentos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and (storage.foldername(name))[2] = 'documentos'
    and public.has_permission('people.manage')
  );

-- Se lee el archivo sólo si se puede ver el documento (o, para recepción, mientras lo sube).
create policy "Archivos de documentos visibles" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and (public.has_permission('people.manage')
         or exists (select 1 from public.documents d
                     where d.file_path = objects.name and d.academy_id = public.current_academy_id()
                       and (d.audience = 'all' or public.has_permission('people.view'))))
  );

create policy "Recepción borra archivos de documentos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
    and public.has_permission('people.manage')
  );

revoke all on function public.current_regulation_id() from public, anon;
revoke all on function public.regulation_accepted(uuid) from public, anon;
revoke all on function public.publish_regulation(text, text) from public, anon;
revoke all on function public.accept_regulation(uuid) from public, anon;
grant execute on function public.current_regulation_id() to authenticated;
grant execute on function public.regulation_accepted(uuid) to authenticated;
grant execute on function public.publish_regulation(text, text) to authenticated;
grant execute on function public.accept_regulation(uuid) to authenticated;
