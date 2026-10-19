# Plantillas de email de Supabase

Se cargan en Supabase → **Authentication → Emails** (o "Email Templates").
Los enlaces llevan a `/auth/confirm`, donde la persona toca un botón para continuar.
Así los revisores automáticos de enlaces (Outlook, Hotmail, antivirus) no gastan el enlace.

## Confirm signup · Confirmar cuenta

**Asunto:** Activá tu cuenta de Extreme Dance Academy

```html
<h2>¡Hola! Te damos la bienvenida a Extreme Dance Academy</h2>
<p>Para activar tu cuenta, tocá el botón:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/inicio">Activar mi cuenta</a></p>
<p>Si no creaste una cuenta, podés ignorar este email.</p>
```

## Reset password · Recuperar contraseña

**Asunto:** Creá una contraseña nueva para Extreme Dance Academy

```html
<h2>Contraseña nueva</h2>
<p>Pediste crear una contraseña nueva. Tocá el botón para continuar:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nueva-clave">Crear contraseña nueva</a></p>
<p>Si no lo pediste, ignorá este email: tu contraseña actual sigue funcionando.</p>
```

## Change email address · Cambio de email

**Asunto:** Confirmá tu email nuevo en Extreme Dance Academy

```html
<h2>Confirmá tu email nuevo</h2>
<p>Tocá el botón para confirmar el cambio de email de tu cuenta:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/perfil">Confirmar email</a></p>
<p>Si no pediste este cambio, avisá en recepción.</p>
```
