-- =====================================================================
-- Migración 0011 · Zona horaria de la base
-- La base usaba UTC: después de las 21 h de Argentina, "hoy" ya era mañana
-- para los valores por defecto (alta de alumnos, inicio de cuotas y horarios).
-- Las reglas de negocio ya usaban la hora de la academia; esto alinea el resto.
-- Los instantes (timestamptz) no cambian: sólo cómo se interpreta "hoy".
-- =====================================================================

do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Argentina/Buenos_Aires');
end $$;

-- Para el resto de esta conexión también.
set timezone to 'America/Argentina/Buenos_Aires';
