// E-mails do sistema (boas-vindas, aprovação e reprovação). Se o SMTP não estiver configurado,
// nada é enviado e o motivo vai para o log: o cadastro e a aprovação continuam funcionando.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logServerError } from './errorlog.js';

const mailEnabled = !!(config.smtp.host && config.smtp.user && config.smtp.pass);

const transport = mailEnabled
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function layout(title: string, paragraphs: string[], button?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#e8e2d4">${p}</p>`).join('');
  const btn = button
    ? `<p style="margin:22px 0 4px"><a href="${esc(button.url)}" style="background:#ffa80f;color:#1a1200;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block">${esc(button.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#0b0b0a;padding:24px;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#15130e;border:1px solid #3a2e10;border-radius:14px">
<tr><td style="padding:28px 30px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:3px;color:#ffa80f;font-weight:700">HANGAR MNG</p>
<h1 style="margin:0 0 18px;font-size:22px;color:#fff6dd">${esc(title)}</h1>
${body}${btn}
<p style="margin:26px 0 0;font-size:12px;color:#8d8672">Esquadrão MNG · DCS World</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!transport) {
    console.log(`[e-mail] SMTP não configurado: "${subject}" para ${to} não foi enviado.`);
    return;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, html, text });
  } catch (e) {
    console.error(`[e-mail] falha ao enviar "${subject}" para ${to}:`, e instanceof Error ? e.message : e);
    void logServerError(e, { source: 'mail', route: subject });
  }
}

const first = (name: string | null) => (name?.trim().split(/\s+/)[0] || 'piloto');

/** Sem await no chamador: um e-mail lento ou com erro nunca atrapalha o login */
export function sendWelcome(u: { email: string; name: string | null }) {
  const n = esc(first(u.name));
  const subject = 'Recebemos o seu cadastro no Hangar MNG';
  const paras = [
    `Olá, ${n}!`,
    'Recebemos o seu cadastro no Hangar MNG, o hangar do esquadrão MNG.',
    'Ele vai passar por uma análise de um dos administradores e voltamos a falar com você em breve, por este mesmo e-mail.',
    'Enquanto isso, não é preciso fazer nada.',
  ];
  void send(u.email, subject, layout('Cadastro recebido', paras),
    `Olá, ${first(u.name)}!\n\nRecebemos o seu cadastro no Hangar MNG. Ele vai passar por uma análise de um dos administradores e voltamos a falar com você em breve, por este mesmo e-mail.\n\nEsquadrão MNG`);
}

export function sendApproved(u: { email: string; name: string | null }) {
  const n = esc(first(u.name));
  const subject = 'Seu cadastro no Hangar MNG foi aprovado';
  const paras = [
    `Boas notícias, ${n}!`,
    'Seu cadastro foi <b>aprovado</b>. Você já pode entrar, escolher o seu nickname e começar a desbloquear aeronaves.',
    'Bons voos!',
  ];
  void send(u.email, subject, layout('Cadastro aprovado', paras, { label: 'Entrar no Hangar MNG', url: config.appUrl }),
    `Boas notícias, ${first(u.name)}!\n\nSeu cadastro no Hangar MNG foi aprovado. Entre em ${config.appUrl}, escolha o seu nickname e comece a desbloquear aeronaves.\n\nBons voos!`);
}

export function sendRejected(u: { email: string; name: string | null }) {
  const n = esc(first(u.name));
  const subject = 'Sobre o seu cadastro no Hangar MNG';
  const paras = [
    `Olá, ${n}.`,
    'Depois de analisar o seu cadastro, não foi possível aprová-lo desta vez.',
    'Se você acha que houve um engano, fale com um dos administradores do esquadrão.',
  ];
  void send(u.email, subject, layout('Cadastro não aprovado', paras),
    `Olá, ${first(u.name)}.\n\nDepois de analisar o seu cadastro no Hangar MNG, não foi possível aprová-lo desta vez. Se você acha que houve um engano, fale com um dos administradores do esquadrão.`);
}

export function sendNewMission(to: { email: string; name: string | null }, m: { title: string; briefing: string; startsAt: Date; weeks: number }) {
  const when = m.startsAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });
  const subject = `Nova missão: ${m.title}`;
  const paras = [
    `Olá, ${esc(first(to.name))}!`,
    `Uma nova missão foi agendada: <b>${esc(m.title)}</b>.`,
    `Quando: ${esc(when)} (horário de Brasília)${m.weeks > 1 ? `, repetindo por ${m.weeks} semanas` : ''}.`,
    ...(m.briefing ? [esc(m.briefing).replace(/\n/g, '<br>')] : []),
    'Entre no Hangar e inscreva-se com uma aeronave da sua frota.',
  ];
  void send(to.email, subject, layout('Nova missão', paras, { label: 'Ver missões', url: `${config.appUrl.replace(/\/$/, '')}/missoes` }),
    `Nova missão: ${m.title}\nQuando: ${when} (Brasília)\n${m.briefing}\n\nInscreva-se em ${config.appUrl}`);
}
