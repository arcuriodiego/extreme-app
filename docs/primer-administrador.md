# Nombrar al primer administrador

Se hace una sola vez por academia (y otra vez en producción, cuando exista).
Después, los roles se asignan desde la app: **Gestión → Usuarios y roles**.

1. La persona crea su cuenta desde la app y confirma el email.
2. En Supabase: **SQL Editor** → **New query**.
3. Pegar, cambiando el email:

   ```sql
   select public.bootstrap_admin('email-de-la-persona@ejemplo.com');
   ```

4. **Run**. Debe responder: `Listo: Nombre Apellido ahora tiene rol de Administración.`
5. La persona cierra sesión y vuelve a ingresar (o recarga el inicio): ve la insignia
   ADMINISTRACIÓN y el acceso a **Gestión**.

Si la academia ya tiene administración, la función se niega: a partir de ahí todo se
hace desde la app, con registro de auditoría.
