-- =====================================================================
-- Migración 0002 · Academia inicial
-- Crea Extreme Dance Academy y su sede principal en todos los entornos.
-- Es idempotente: si ya existen, no hace nada.
-- Al crear la academia, el disparador de la migración 0001 carga sus reglas.
-- =====================================================================

insert into public.academies (slug, name)
values ('extreme-dance', 'Extreme Dance Academy')
on conflict (slug) do nothing;

insert into public.branches (academy_id, name)
select id, 'Sede principal' from public.academies where slug = 'extreme-dance'
on conflict (academy_id, name) do nothing;
