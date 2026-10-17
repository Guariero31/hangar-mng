import { renderMailTemplate } from './mail-template.js';
// E-mails do sistema (boas-vindas, aprovação e reprovação). Se o SMTP não estiver configurado,
// nada é enviado e o motivo vai para o log: o cadastro e a aprovação continuam funcionando.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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

// O logo vai dentro do próprio e-mail (imagem anexada, referenciada por cid:). Imagens remotas
// costumam ser bloqueadas por Outlook e Gmail até o leitor autorizar; a anexada aparece sempre.
// O caminho é o mesmo no desenvolvimento (src) e na produção (dist): web/public fica na imagem.
const LOGO_FILE = fileURLToPath(new URL('../../../web/public/mng-logo-128.png', import.meta.url));
const LOGO_CID = 'mng-logo@hangar';
const hasLogo = fs.existsSync(LOGO_FILE);

function layout(title: string, paragraphs: string[], button?: { label: string; url: string }, details?: { label: string; value: string }[]) {
  return renderMailTemplate({ title, paragraphs, button, details, appUrl: config.appUrl, logoSrc: hasLogo ? `cid:${LOGO_CID}` : undefined });
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!transport) {
    console.log(`[e-mail] SMTP não configurado: "${subject}" para ${to} não foi enviado.`);
    return;
  }
  try {
    await transport.sendMail({
      from: config.smtp.from, to, subject, html, text,
      attachments: hasLogo && html.includes(`cid:${LOGO_CID}`) ? [{ filename: 'mng-logo.png', path: LOGO_FILE, cid: LOGO_CID, contentDisposition: 'inline' }] : [],
    });
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
    'Seu cadastro no <b>Hangar MNG</b> foi recebido com sucesso.',
    'Agora, nossa equipe vai revisar sua solicitação para liberar o acesso ao esquadrão.',
    'Assim que seu acesso for aprovado, você receberá um novo e-mail com as orientações para entrar. Até lá, é só aguardar — não precisa se cadastrar novamente.',
  ];
  void send(u.email, subject, layout('Cadastro recebido', paras),
    `Olá, ${first(u.name)}!\n\nSeu cadastro no Hangar MNG foi recebido com sucesso.\n\nAgora, nossa equipe vai revisar sua solicitação para liberar o acesso ao esquadrão.\n\nAssim que seu acesso for aprovado, você receberá um novo e-mail com as orientações para entrar. Até lá, é só aguardar — não precisa se cadastrar novamente.\n\nEsquadrão MNG`);
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
    'A análise do seu cadastro no <b>Hangar MNG</b> foi concluída. Neste momento, sua solicitação de acesso não foi aprovada.',
    'Se quiser esclarecer essa decisão ou acredita que houve um engano, entre em contato com um dos administradores do esquadrão MNG.',
  ];
  void send(u.email, subject, layout('Sobre sua solicitação de acesso', paras),
    `Olá, ${first(u.name)}.\n\nA análise do seu cadastro no Hangar MNG foi concluída. Neste momento, sua solicitação de acesso não foi aprovada.\n\nSe quiser esclarecer essa decisão ou acredita que houve um engano, entre em contato com um dos administradores do esquadrão MNG.`);
}

export function sendNewMission(to: { email: string; name: string | null }, m: { title: string; briefing: string; startsAt: Date; weeks: number }) {
  const when = m.startsAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });
  const subject = `Nova missão: ${m.title}`;
  const paras = [
    `Olá, ${esc(first(to.name))}!`,
    `Uma nova missão foi agendada: <b>${esc(m.title)}</b>.`,
    ...(m.briefing ? [esc(m.briefing).replace(/\n/g, '<br>')] : []),
    'Entre no Hangar e inscreva-se com uma aeronave da sua frota.',
  ];
  void send(to.email, subject, layout('Nova missão', paras, { label: 'Ver operação e inscrever-se', url: `${config.appUrl.replace(/\/$/, '')}/missoes` }, [{ label: 'Operação', value: m.title }, { label: 'Data e horário de Brasília', value: when }, ...(m.weeks > 1 ? [{ label: 'Recorrência', value: `Semanal, por ${m.weeks} semanas` }] : [])]),
    `Nova missão: ${m.title}\nQuando: ${when} (Brasília)\n${m.briefing}\n\nInscreva-se em ${config.appUrl}`);
}
