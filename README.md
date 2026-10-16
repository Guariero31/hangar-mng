# Hangar DCS

Site de Pontos de Missão (PM) individuais dos pilotos do servidor DCS.
Login com Google → escolha de nickname → Tech Tree. Admin tem painel com todos os jogadores e o cadastro da tech tree.

- **web/** — front-end em React (Vite + React Router + React Query)
- **server/** — API em Node (Express) + PostgreSQL

## Rodar na sua máquina

Pré-requisito: **Node.js 20 ou mais novo** (https://nodejs.org, versão LTS).

1. Dê dois cliques em **`iniciar.bat`**.
   - Na primeira vez ele instala as dependências (alguns minutos).
   - O navegador abre em **http://localhost:5173**.
2. Na tela de login, use **"Entrar como admin"** (login de desenvolvimento, sem Google).
3. Para testar compras, dê PM a você mesmo em **Painel admin → Jogadores**.

Para parar, feche a janela preta.

Pelo terminal, o mesmo é `npm install` e depois `npm run dev`, na pasta do projeto.

### Banco de dados
Sem configurar nada, o servidor usa um **PostgreSQL embutido**, salvo em `server/data/pglite`.
Ele já vem com a tech tree completa e alguns pilotos de exemplo. Para zerar, feche o servidor e apague a pasta `server/data`.

## Configuração (`server/.env`)

O `iniciar.bat` cria esse arquivo a partir do `server/.env.example`. Depois de mudar algo nele, reinicie o servidor.

### Usar um PostgreSQL instalado (em vez do embutido)
1. Instale o PostgreSQL para Windows: https://www.postgresql.org/download/windows/ (anote a senha do usuário `postgres`).
2. Crie um banco chamado `hangar`, pelo pgAdmin ou pelo terminal: `createdb -U postgres hangar`
3. No `server/.env`:
   ```
   DATABASE_URL=postgres://postgres:SUA_SENHA@localhost:5432/hangar
   ```
4. Reinicie. As tabelas são criadas sozinhas (`server/migrations`).

### Ativar o login com Google
1. Em https://console.cloud.google.com crie um projeto.
2. **APIs e serviços → Tela de consentimento OAuth**: tipo "Externo", preencha nome e e-mail.
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
   - *Origens JavaScript autorizadas*: `http://localhost:5173` e `http://localhost`
     (depois, adicione também o endereço do site publicado).
4. Copie o **ID do cliente** para o `server/.env`:
   ```
   GOOGLE_CLIENT_ID=123456-abc.apps.googleusercontent.com
   ADMIN_EMAILS=seu-email@gmail.com
   ```
   Quem estiver em `ADMIN_EMAILS` vira admin ao entrar. Com o Google configurado, o login de desenvolvimento some
   (para mantê-lo enquanto testa, use `DEV_LOGIN=true`).

## Estrutura

```
server/
  migrations/001_init.sql   tabelas do banco
  src/index.ts              inicia a API
  src/routes.ts             todas as rotas /api
  src/auth.ts               sessão, login Google, proteções de rota
  src/services/             regras do jogo (usuários, tech tree, admin)
  src/seed.ts               dados de exemplo
web/
  src/App.tsx               rotas das telas
  src/api/hooks.ts          todos os dados e ações (useTechTree, useUnlock, usePlayers…)
  src/pages/Login.tsx       login
  src/pages/Nickname.tsx    escolha do nickname
  src/pages/TechTree.tsx    Tech Tree DCS (porte do tech-tree-dcs.html, ligada ao servidor)
  src/pages/techtree.css    visual da Tech Tree
  src/pages/admin/          painel admin (jogadores e tech tree)
  public/aircraft-icons.svg silhuetas das aeronaves
```

## Regras da Tech Tree
- **Custo e bônus são por tier.** Tiers com custo 0 (o Tier I) ficam na frota de todos automaticamente.
- **Regra 1:** para comprar uma aeronave do tier N é preciso ter ao menos uma aeronave do tier N-1.
- **Regra 2 (Bound):** é preciso ter também as aeronaves ligadas pela linha magenta.
- As linhas tracejadas indicam mães: é preciso ter ao menos uma mãe ativa cadastrada. Sem mãe ativa, vale qualquer aeronave do tier anterior.
- O ganho por missão mostrado na tela é estimativa: `PM base por missão × bônus do tier da aeronave`.

Tudo isso é editável em **Painel admin → Tech tree**: custo e bônus de cada tier, PM base por missão,
e cada aeronave (tier, papel, linha na árvore, ícone, restrição de armamento, Bound e família).
A tech tree inicial (41 aeronaves) é criada sozinha num banco vazio, a partir de `server/src/seed.ts`.

## Regras importantes
- O saldo de PM de cada jogador é a soma do histórico (`points_ledger`). Nada some: todo lançamento tem motivo, origem e autor.
- Compras, lançamentos e revogações rodam em transação. Cliques simultâneos não gastam PM em dobro.
- Toda ação de admin fica registrada em `admin_audit_log`.

## Publicar (produção)
```
npm run build
npm start
```
A API passa a entregar o site já compilado em http://localhost:3001. Em produção defina no `.env`:
`NODE_ENV=production`, `JWT_SECRET` (texto longo aleatório), `GOOGLE_CLIENT_ID` e `DATABASE_URL`.

## Verificações de qualidade

Execute `npm run check`: verifica tipos, proíbe `any` explícito, executa os testes em banco temporário em memória e compila os dois workspaces. Os testes não acessam `server/data` nem o banco configurado no `.env`.

O histórico do perfil, jogadores, aprovações, auditoria e ranking permitem navegar pelas páginas. Os filtros e a ordenação dos jogadores são aplicados no servidor; os indicadores são globais. A exportação CSV identifica que contém apenas a página exibida.

Reembolsos usam o débito da aquisição removida, nunca o preço atual. Concessões gratuitas não devolvem PM. A migração conserva os dados existentes e só associa compras antigas quando o histórico permite identificar a aquisição com segurança; sem comprovação, não há reembolso automático. Valores agregados suportam mais de 32 bits e são recusados acima de `Number.MAX_SAFE_INTEGER`.

Novos usuários ficam pendentes mesmo antes do primeiro administrador. Configure `ADMIN_EMAILS` antes de publicar. As conquistas do esquadrão são atualizadas em segundo plano a cada minuto; o ranking apenas consulta os resultados.

## Arquivos e briefings das missões

No cadastro ou edição de uma missão, administradores podem enviar uma imagem PNG/JPG/WebP (até 10 MB) e um ZIP de briefing interativo (até 25 MB). Os anexos só ficam associados à missão depois de salvar; o envio de um novo arquivo preserva o anterior quando ocorre erro.

O ZIP deve conter um único HTML de entrada ou um `index.html` na raiz, mantendo os nomes e pastas usados pelos links do documento. Inclua imagens, módulos JavaScript, CSS e áudio local. Limites: 128 itens, 20 MB por arquivo e 80 MB descompactados. Não são aceitos caminhos que saem do pacote, links simbólicos, arquivos criptografados ou tipos executáveis de sistema. O exemplo “Ace Combat” espera `Ace combat briefing.mp3` ao lado do HTML.

Os pilotos abrem o anexo em **Ver operação → Abrir briefing interativo → Iniciar briefing**, com opção de tela cheia. O briefing escrito permanece disponível como alternativa. O visualizador usa sandbox sem acesso à sessão, URLs temporárias de leitura e recursos limitados ao pacote, Three.js no jsDelivr e fontes Google. A música depende de interação e dos controles do próprio briefing. Arquivos usam o banco de dados em blocos, incluindo o banco embutido, e acompanham os backups PostgreSQL. Remover um anexo da missão desvincula o arquivo; não apaga cópias referenciadas por outras missões.

## Próxima fase: automação com o servidor DCS

O banco já tem `dcs_links` (vínculo com o UCID), `link_codes` e `points_ledger.external_ref` (evita lançar o mesmo evento duas vezes).
Falta criar: a rota que recebe eventos do servidor (protegida por `SERVER_API_KEY`), o vínculo por código no chat do DCS e o script Lua.

## Publicar na internet
Veja **DEPLOY-VPS.md** (VPS com Docker, HTTPS automático e backup) e **GOOGLE-LOGIN.md** (login com Google).
