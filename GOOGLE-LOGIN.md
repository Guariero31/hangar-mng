# Ligar o login com Google (10 minutos)

O sistema já está pronto. Falta só criar a credencial no Google e colar o ID.

## 1. Criar o projeto
1. Abra https://console.cloud.google.com e entre com a conta que vai ser "dona" do app.
2. No topo, **Selecionar projeto → Novo projeto**. Nome: `Hangar MNG`. Criar.

## 2. Tela de consentimento
1. Menu **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform → Começar").
2. Nome do app: `Hangar MNG` · E-mail de suporte: o seu.
3. Público: **Externo**. E-mail de contato: o seu. Concluir.
4. Em **Acesso a dados / Escopos**, deixe só os padrões (`openid`, e-mail e perfil). Não adicione outros.
5. Em **Público**, clique em **Publicar app** (assim qualquer piloto consegue tentar entrar; quem decide quem passa é a aprovação de cadastros do Hangar).
   - Se preferir deixar em *Teste*, cadastre cada e-mail em **Usuários de teste** (máx. 100).

## 3. Criar o ID do cliente
1. **Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo de aplicativo: **Aplicativo da Web**. Nome: `Hangar MNG web`.
3. **Origens JavaScript autorizadas → Adicionar URI**:
   ```
   http://localhost:5173
   ```
   (Quando publicar online, adicione também o endereço real, ex.: `https://hangar.seudominio.com`.)
4. **Não** preencha "URIs de redirecionamento".
5. Criar → copie o **ID do cliente** (`123456789012-xxxx.apps.googleusercontent.com`).
   O "segredo do cliente" **não é usado** — não precisa guardar.

## 4. Colar no sistema
Dê dois cliques em **`configurar-google.bat`**, cole o ID e digite o seu e-mail do Google.
Depois feche o Hangar e abra de novo pelo **`iniciar.bat`**.

Pronto: a tela de login mostra o botão do Google. O seu e-mail entra direto como admin; os outros pilotos caem na fila de **Aprovações**.

## Se der erro
| Mensagem | Causa | Solução |
|---|---|---|
| "O login com Google falhou… Origens JavaScript autorizadas" | O endereço do site não está na lista do passo 3 | Adicione exatamente `http://localhost:5173` (sem `/` no fim) e espere 1–5 min |
| "Acesso bloqueado: app não verificado / 403 access_denied" | App em modo *Teste* e o e-mail não está na lista | Publique o app (passo 2.5) ou cadastre o e-mail em Usuários de teste |
| "Credencial do Google inválida" | ID do cliente errado no `.env` | Rode `configurar-google.bat` de novo |
| O botão do Google não aparece | `GOOGLE_CLIENT_ID` vazio | Rode `configurar-google.bat` |

## Para publicar na internet depois
Precisa de domínio com HTTPS (o Google só aceita `localhost` ou HTTPS), `NODE_ENV=production`, um `JWT_SECRET` próprio e, atrás de proxy, `TRUST_PROXY=1`. Veja `server/.env.example`.
