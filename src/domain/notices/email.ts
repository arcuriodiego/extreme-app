/** Email de un aviso: asunto, HTML simple (se ve bien en cualquier correo) y texto plano. */

export interface NoticeEmailInput {
  firstName: string | null;
  title: string;
  body: string;
  link: string | null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Sólo se enlaza a pantallas de la propia app. */
function safePath(link: string | null): string {
  return link && /^\/[a-z0-9/_-]*$/.test(link) ? link : "/avisos";
}

export function noticeEmail(input: NoticeEmailInput, appUrl: string, academyName: string): { subject: string; html: string; text: string } {
  const url = `${appUrl}${safePath(input.link)}`;
  const hello = input.firstName ? `Hola, ${input.firstName}:` : "Hola:";
  const subject = input.title.slice(0, 140);
  const bodyHtml = escapeHtml(input.body).replace(/\n/g, "<br>");
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#111111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td style="font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#D90000;padding-bottom:16px">${escapeHtml(academyName)}</td></tr>
<tr><td style="font-size:15px;padding-bottom:8px">${escapeHtml(hello)}</td></tr>
<tr><td style="font-size:20px;font-weight:bold;line-height:1.3;padding-bottom:10px">${escapeHtml(input.title)}</td></tr>
${bodyHtml ? `<tr><td style="font-size:15px;line-height:1.5;padding-bottom:20px">${bodyHtml}</td></tr>` : ""}
<tr><td><a href="${escapeHtml(url)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 20px;border-radius:999px">Abrir la app</a></td></tr>
<tr><td style="font-size:12px;color:#5c5c5c;padding-top:24px">Recibís este aviso porque tenés una cuenta en la app de ${escapeHtml(academyName)}.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  const text = [hello, "", input.title, input.body ? `\n${input.body}` : "", "", `Abrir la app: ${url}`].join("\n");
  return { subject, html, text };
}
