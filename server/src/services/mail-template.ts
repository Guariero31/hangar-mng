const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));

interface MailTemplate {
  title: string;
  paragraphs: string[];
  appUrl: string;
  button?: { label: string; url: string };
  details?: { label: string; value: string }[];
  /** Endereço da imagem do cabeçalho. Use "cid:..." para a imagem anexada ao e-mail. */
  logoSrc?: string;
}

/** Paragraphs are trusted markup; dynamic values must be escaped by the caller. */
export function renderMailTemplate({ title, paragraphs, appUrl, button, details, logoSrc }: MailTemplate): string {
  const baseUrl = appUrl.replace(/\/$/, '');
  const body = paragraphs.map(paragraph => `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#45483e">${paragraph}</p>`).join('');
  const detailRows = details?.map(detail => `<tr><td style="padding:10px 16px;border-bottom:1px solid #e3dfd1"><p style="margin:0 0 5px;color:#77796b;font-size:11px;letter-spacing:1px;text-transform:uppercase">${escapeHtml(detail.label)}</p><p style="margin:0;color:#25291f;font-size:15px;line-height:1.5;font-weight:600">${escapeHtml(detail.value)}</p></td></tr>`).join('');
  const action = button ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 0"><tr><td bgcolor="#ffc34b" style="border-radius:7px"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:15px 24px;border:1px solid #ffc34b;border-radius:7px;font-size:14px;font-weight:700;text-decoration:none;color:#29220f">${escapeHtml(button.label)} &rarr;</a></td></tr></table><p style="margin:22px 0 0;color:#77796b;font-size:12px;line-height:1.6">Se o botão não abrir, <a href="${escapeHtml(button.url)}" style="color:#725219;text-decoration:underline">acesse por este link</a>.</p>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#eeede6;font-family:Segoe UI,Arial,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(title)} · Hangar MNG — Esquadrão MNG, DCS World.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#eeede6"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px">
<tr><td bgcolor="#13160f" style="padding:24px 28px;border-radius:12px 12px 0 0;border-bottom:3px solid #ffc34b">
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:16px"><img src="${escapeHtml(logoSrc ?? `${baseUrl}/mng-logo-128.png`)}" width="48" height="48" alt="MNG" style="display:block;border:0"></td><td><p style="margin:0;color:#f4f1e4;font-size:18px;font-weight:700;letter-spacing:2px">HANGAR MNG</p><p style="margin:6px 0 0;color:#b3b39d;font-size:10px;letter-spacing:2px">ESQUADRÃO MNG · DCS WORLD</p></td></tr></table></td></tr>
<tr><td bgcolor="#fffef9" style="padding:32px 28px;border-radius:0 0 12px 12px">
<p style="margin:0 0 12px;color:#8a641b;font-size:10px;letter-spacing:2px;font-weight:700">COMUNICAÇÃO DO ESQUADRÃO</p>
<h1 style="margin:0 0 26px;color:#25291f;font-size:28px;font-weight:700;line-height:1.25">${escapeHtml(title)}</h1>
${body}${detailRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f1efe5" style="margin:22px 0;border-radius:8px">${detailRows}</table>` : ''}${action}
</td></tr>
<tr><td style="padding:24px 20px;text-align:center"><p style="margin:0;color:#686d5e;font-size:12px;font-weight:600">Equipe Hangar MNG</p><p style="margin:10px 0 0;color:#777c6d;font-size:11px;line-height:1.7">Mensagem automática do Hangar MNG.<br>Para falar com a equipe, procure um administrador do esquadrão.</p></td></tr>
</table></td></tr></table></body></html>`;
}
