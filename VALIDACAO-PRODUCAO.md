# Validação da publicação

As verificações locais usam PGlite em memória e não acessam o banco real. Execute `npm run check` antes de publicar. A rotina de integração contínua também executa essa verificação com Node.js 22.

## Banco e atualização

1. Gere e conserve um backup anterior à atualização.
2. Publique conforme `DEPLOY-VPS.md` e confirme que a migração 006 foi aplicada sem erro.
3. Confirme que `/api/health` responde, entre com uma conta administrativa de `ADMIN_EMAILS` e confira a árvore e os saldos.
4. Em uma conta de homologação, confira compra, desfazer, concessão gratuita e revogação. Reembolso deve usar o preço pago; concessão gratuita devolve zero PM.
5. Confira a fila de aprovação com uma conta comum nova, a navegação pelas páginas e as ações administrativas.

A migração não corrige automaticamente lançamentos antigos incorretos. Esses valores exigem revisão do histórico e, quando necessário, um lançamento de ajuste com motivo. Aquisições antigas sem evidência suficiente de pagamento não recebem preço inferido.

## Google e e-mail

- Confira a origem HTTPS no cliente OAuth do Google e teste login, aprovação e suspensão de contas.
- Com SMTP configurado, teste mensagens de cadastro, aprovação e recusa em uma conta de homologação.
- Evite copiar credenciais para logs ou relatórios. Falhas de e-mail continuam sem desfazer ações concluídas no banco.

## Recuperação de backup

Confirme os logs do serviço de backup e a existência de arquivos recentes. Para testar recuperação, restaure uma cópia em um banco separado de homologação e use uma instância da aplicação apontada apenas para esse banco. Não restaure um teste sobre o banco de produção.

Após restaurar, confira migrações, quantidade de usuários, lançamentos, saldos, frota e auditoria. Registre data, arquivo usado e resultado do teste. O formato de restauração depende do arquivo gerado; o procedimento SQL compactado está em `DEPLOY-VPS.md`.

Mantenha cópias fora da VPS. A automação dessa transferência depende do destino de armazenamento e das credenciais escolhidas pelo responsável; o repositório não contém esse acesso. Verifique também o prazo de retenção e a remoção de dados pessoais de campos livres da auditoria quando necessário.

## Limites das verificações realizadas

Os testes cobrem as regras corrigidas, a migração de dados antigos, paginação, permissões HTTP e encerramento de requisições. Não confirmam a configuração real de PostgreSQL, DNS, HTTPS, Google, SMTP nem a recuperação de um backup da VPS. Essas verificações precisam do ambiente publicado.
