#!/usr/bin/env bash
# Configura el inicio de sesión (Auth) de un proyecto de Supabase con la API de administración:
# direcciones de la app, emails por Resend (SMTP) y plantillas en castellano.
# Lo corre el CI al publicar producción. No imprime ninguna clave.
#
# Variables: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, APP_URL, SMTP_PASS (clave de Resend),
#            EXTRA_REDIRECTS (opcional, separadas por coma).
set -euo pipefail
: "${SUPABASE_ACCESS_TOKEN:?}" "${SUPABASE_PROJECT_REF:?}" "${APP_URL:?}" "${SMTP_PASS:?}"
dir="$(cd "$(dirname "$0")/../supabase/auth" && pwd)"
redirects="${APP_URL}/**"
if [ -n "${EXTRA_REDIRECTS:-}" ]; then redirects="${redirects},${EXTRA_REDIRECTS}"; fi

body=$(jq -n \
  --arg site "$APP_URL" --arg redirects "$redirects" --arg pass "$SMTP_PASS" \
  --rawfile c "$dir/confirmation.html" --rawfile cs "$dir/confirmation.subject" \
  --rawfile r "$dir/recovery.html" --rawfile rs "$dir/recovery.subject" \
  --rawfile e "$dir/email_change.html" --rawfile es "$dir/email_change.subject" \
  '{
    site_url: $site,
    uri_allow_list: $redirects,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    password_min_length: 8,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: $pass,
    smtp_admin_email: "hola@extremedance.com.ar",
    smtp_sender_name: "Extreme Dance Academy",
    smtp_max_frequency: 30,
    rate_limit_email_sent: 100,
    mailer_subjects_confirmation: ($cs | rtrimstr("\n")),
    mailer_templates_confirmation_content: $c,
    mailer_subjects_recovery: ($rs | rtrimstr("\n")),
    mailer_templates_recovery_content: $r,
    mailer_subjects_email_change: ($es | rtrimstr("\n")),
    mailer_templates_email_change_content: $e
  }')

code=$(curl -sS -o /tmp/auth-response.json -w '%{http_code}' -X PATCH \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" -H "Content-Type: application/json" \
  --data "$body")
if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
  echo "::error title=Configurar Auth::La API de Supabase respondió ${code}: $(head -c 600 /tmp/auth-response.json)"
  exit 1
fi
# Confirma lo aplicado (sin claves).
summary=$(jq -c '{site_url, uri_allow_list, smtp_host, smtp_port, smtp_user, smtp_admin_email, smtp_pass_cargada: ((.smtp_pass // "") | length > 0), mailer_autoconfirm, rate_limit_email_sent, mailer_subjects_confirmation}' /tmp/auth-response.json)
echo "$summary"
echo "::notice title=Auth de producción configurado::${summary}"
