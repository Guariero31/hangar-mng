# Avisos de novas missões no Discord

No `.env` da raiz usado pelo Docker Compose, configure:

```dotenv
DISCORD_WEBHOOK_URL=cole_a_url_secreta_do_webhook
DISCORD_NOTIFICATIONS_ENABLED=true
```

Recrie o app com `docker compose up -d --build app`. A migração da fila é aplicada na inicialização.
No desenvolvimento, use `server/.env`; os avisos automáticos ficam desligados por padrão.
Nunca coloque o webhook no frontend ou em arquivos versionados.

Uma nova missão gera um anúncio com título, horário de Brasília, mapa e link. Uma série semanal gera um anúncio da série, apontando para a primeira operação. Edições não reenviam o aviso. A ativação não anuncia missões antigas.

Se houver uma imagem anexada à missão (PNG, JPG ou WebP, até 10 MiB), ela é enviada como arquivo ao Discord e aparece em destaque no anúncio. Assim, a imagem não depende dos links temporários do site. Sem imagem ou com arquivo acima desse limite, o aviso é enviado com texto e link. O envio usa a capa anexada, não imagens internas do pacote de briefing.

Os avisos são gravados na mesma transação da criação da missão e processados a cada 15 segundos. A fila registra confirmação, tentativas e falhas sem guardar o token. Erros temporários têm até oito tentativas; limites do Discord respeitam o tempo de espera informado. Webhooks inválidos ou revogados interrompem o envio. Missões canceladas ou já iniciadas antes do envio são ignoradas.

O registro por missão e a reserva de envio impedem reenvios normais e processamento simultâneo. Como o Discord não fornece uma chave de idempotência para esse endpoint, uma queda entre a confirmação externa e a gravação local pode causar um anúncio repetido.

Para testar localmente, configure a URL em `server/.env` e execute `npm run discord:test`. O comando envia uma única mensagem identificada como teste, sem criar uma missão e sem depender de os avisos automáticos estarem ligados. No container de produção: `docker compose exec app node dist/discord-test.js`.

Esta etapa anuncia novas missões. Cancelamentos e relatórios ainda não geram mensagens no canal. Os links mantêm as regras de login e aprovação do Hangar.
