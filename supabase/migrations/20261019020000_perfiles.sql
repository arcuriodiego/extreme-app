-- =====================================================================
-- Migración 0003 · Perfiles de usuario
-- Cada persona con cuenta (alumno, tutor, profesor, personal) tiene un perfil.
-- Se crea solo al registrarse. Cada uno ve y edita únicamente el suyo.
-- Los alumnos menores sin cuenta propia se registran aparte (tabla students).
-- =====================================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  academy_id  uuid not null references public.academies(id) on delete restrict,
  first_name  text not null default '' check (length(first_name) <= 80),
  last_name   text not null default '' check (length(last_name) <= 80),
  phone       text check (phone is null or phone ~ '^[0-9 +()-]{6,25}$'),
  birth_date  date check (birth_date is null or birth_date >= date '1900-01-01'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_academy_idx on public.profiles (academy_id);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------
-- Creación automática del perfil al registrarse.
-- El nombre llega en los metadatos del registro. La academia se toma por su
-- identificador; si no viene, se usa la primera academia creada.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_academy uuid;
begin
  select id into v_academy from public.academies where slug = v_meta ->> 'academy';
  if v_academy is null then
    select id into v_academy from public.academies order by created_at limit 1;
  end if;
  if v_academy is null then
    raise exception 'No hay ninguna academia creada para asociar el usuario.';
  end if;

  insert into public.profiles (id, academy_id, first_name, last_name)
  values (
    new.id,
    v_academy,
    left(trim(coalesce(v_meta ->> 'first_name', '')), 80),
    left(trim(coalesce(v_meta ->> 'last_name', '')), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Seguridad
-- - Nadie anónimo accede a perfiles.
-- - Un usuario lee sólo su perfil y edita sólo sus datos personales:
--   no puede cambiar su academia ni su identificador.
-- - Recepción y administración tendrán sus propias políticas en la Entrega 3.
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone, birth_date) on public.profiles to authenticated;

create policy "Cada usuario ve su perfil"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Cada usuario edita su perfil"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
