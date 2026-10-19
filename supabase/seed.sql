-- Datos iniciales para desarrollo y pruebas. No se usa en producción.
insert into public.academies (slug, name) values ('extreme-dance', 'Extreme Dance Academy');

insert into public.branches (academy_id, name)
select id, 'Sede principal' from public.academies where slug = 'extreme-dance';
-- Las salas se cargan cuando estén definidas.
