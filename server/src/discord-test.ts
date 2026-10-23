import { sendDiscord } from './services/discord-webhook.js';

try {
  await sendDiscord({ username: 'Hangar MNG', allowed_mentions: { parse: [] }, embeds: [{
    title: 'Hangar MNG · Integração conectada', color: 0xffc24a,
    description: 'Mensagem de teste: este canal está pronto para receber os avisos de novas missões quando a integração estiver ativada no servidor.\n\nEste aviso não cria uma missão nem altera inscrições.',
    footer: { text: 'Hangar MNG · Teste de integração' },
  }] });
  console.log('Mensagem de teste confirmada pelo Discord.');
} catch (exception) {
  console.error(exception instanceof Error ? exception.message : 'Falha no teste do Discord.');
  process.exitCode = 1;
}
