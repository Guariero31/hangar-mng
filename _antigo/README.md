# Hangar DCS — sistema de pontuação

Site de pontuação individual para os pilotos do servidor DCS.
Login com Google → escolha de nickname → árvore de aeronaves. Admin tem painel com todos os jogadores.

## Estrutura

```
dcs-sistema/
├── config.js              ← URL e chave do Supabase + nome do site (EDITE AQUI)
├── index.html             ← Tela de login (Google)
├── nickname.html          ← Escolha do nickname no primeiro acesso
├── admin.html             ← Painel do administrador
├── techtree/index.html    ← Tech tree PROVISÓRIA (troque pela sua)
├── js/
│   ├── supabase.js        ← Cliente do Supabase
│   ├── auth.js            ← Login, sessão e proteção de páginas
│   ├── api.js             ← Funções do jogo (é aqui que a sua tech tree se conecta)
│   └── ui.js              ← Barra superior, avisos, formatação
├── css/style.css
└── database/schema.sql    ← Banco de dados (rodar uma vez no Supabase)
```

## Testar agora (modo demonstração)
1. Dê dois cliques em **`iniciar.bat`**. O site abre em http://localhost:8000
2. Clique em "Entrar com Google": na demo você entra direto, como admin, sem Google de verdade.
3. Os dados ficam só no seu navegador. Para zerar, clique no selo **MODO DEMO · zerar** no canto da tela.

Para usar o banco de verdade, siga os passos abaixo e mude `DEMO_MODE` para `false` no `config.js`.

## Passo a passo para colocar no ar

### 1. Supabase
1. Crie uma conta em https://supabase.com e um projeto novo.
2. Em **SQL Editor**, cole todo o `database/schema.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key** para o `config.js`.

### 2. Login com Google
1. No Google Cloud Console (https://console.cloud.google.com), crie um projeto.
2. **APIs e serviços → Tela de consentimento OAuth**: configure como "Externo".
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
   - Em *URIs de redirecionamento autorizados*, coloque:
     `https://SEU-PROJETO.supabase.co/auth/v1/callback`
4. Copie o **Client ID** e o **Client Secret** para o Supabase em
   **Authentication → Providers → Google** e ative.
5. No Supabase, em **Authentication → URL Configuration**:
   - **Site URL**: o endereço do seu site (ex.: `http://localhost:8000` para testar).
   - **Redirect URLs**: adicione `http://localhost:8000/**` e, depois, o endereço publicado.

### 3. Rodar no seu computador
O site não funciona abrindo o arquivo direto (file://). Use o **`iniciar.bat`**
(ou `python servidor.py` dentro da pasta) e abra http://localhost:8000

### 4. Virar admin
Entre uma vez no site com sua conta Google, escolha o nickname, e rode no SQL Editor:
```sql
update public.profiles set role = 'admin' where email = 'seu-email@gmail.com';
```
Recarregue a página: o link **Painel admin** aparece no topo.

### 5. Cadastrar as aeronaves
```sql
insert into public.aircraft (id, name, tier, cost, description) values
  ('tf51d', 'TF-51D Mustang', 1, 0,   'Treinador'),
  ('f5e',   'F-5E Tiger II',  2, 100, null),
  ('f16c',  'F-16C Viper',    3, 300, null);

insert into public.aircraft_prereqs (aircraft_id, requires_id) values
  ('f5e',  'tf51d'),
  ('f16c', 'f5e');
```

### 6. Publicar
Como é um site estático, pode ir para Netlify, Vercel, Cloudflare Pages ou GitHub Pages (grátis).
Depois de publicar, adicione o endereço em **Redirect URLs** e **Site URL** no Supabase.

## Plugando a sua Tech Tree
Coloque a sua tela em `techtree/` (ou mude `PAGES.home` em `js/auth.js`) e use:

```js
import { requireProfile } from '../js/auth.js';
import { getTechTreeState, unlockAircraft } from '../js/api.js';

const profile = await requireProfile();      // redireciona se não estiver logado / sem nickname
const state = await getTechTreeState();      // { balance, aircraft: [{ id, name, tier, cost, requires, unlocked, available, affordable }] }
await unlockAircraft('f16c');                // valida tudo no servidor; lança Error com mensagem em português
```

## Próxima fase (automação DCS)
O banco já tem `dcs_links` (vínculo UCID) e `points_ledger.external_ref` (evita lançar o mesmo evento duas vezes).
Falta: endpoint que recebe eventos do servidor (Supabase Edge Function com chave secreta),
fluxo de vínculo por código no chat do DCS e o script Lua no servidor.
