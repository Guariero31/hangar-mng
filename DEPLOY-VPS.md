# Publicar o Hangar MNG numa VPS da Hostinger

Resultado final: `https://seu-dominio` no ar 24h, com HTTPS automático, banco PostgreSQL, backup diário e login Google.
Tempo estimado: 1 hora, a maior parte esperando o DNS.

> Os nomes de botões do painel da Hostinger mudam de vez em quando. Se algum nome for diferente, procure o equivalente.

## O que você precisa antes
- [ ] Um **domínio** (ex.: `hangar-mng.com.br`). Pode comprar na própria Hostinger ou no Registro.br.
- [ ] A **VPS** (plano KVM 1 ou maior), com **Ubuntu 24.04** e servidor no **Brasil**. Se houver a opção de sistema "Ubuntu 24.04 com Docker", escolha-a.
- [ ] O código no GitHub (já feito: `Guariero31/hangar-mng`).
- [ ] O **ID do cliente do Google** (veja `GOOGLE-LOGIN.md`). Na hora de cadastrar a origem, use `https://seu-dominio`.

## 1. Apontar o domínio para a VPS
1. No painel da Hostinger, abra a VPS e copie o **endereço IP** dela.
2. No painel do seu domínio (DNS), crie um registro **tipo A**: nome `@` (ou o subdomínio, ex. `hangar`), valor = o IP da VPS.
3. Espere propagar (de alguns minutos a 1 hora). Teste no PowerShell: `nslookup seu-dominio` deve mostrar o IP.

## 2. Entrar na VPS
No PowerShell do Windows:
```
ssh root@IP-DA-VPS
```
Use a senha definida na criação da VPS. (Depois do passo 8 dá para trocar para chave SSH.)

## 3. Instalar o Docker (pule se escolheu o sistema com Docker)
```
curl -fsSL https://get.docker.com | sh
docker --version
```

## 4. Baixar o código (repositório privado)
Como o repositório é privado, use uma **chave de deploy** (só leitura):
```
ssh-keygen -t ed25519 -f ~/.ssh/hangar_deploy -N ""
cat ~/.ssh/hangar_deploy.pub
```
1. Copie a linha que aparece (começa com `ssh-ed25519`).
2. No GitHub: repositório → **Settings → Deploy keys → Add deploy key**. Cole, dê o nome "VPS" e **não** marque "Allow write access".
3. De volta na VPS:
```
printf 'Host github.com\n  IdentityFile ~/.ssh/hangar_deploy\n  StrictHostKeyChecking accept-new\n' >> ~/.ssh/config
git clone git@github.com:Guariero31/hangar-mng.git /opt/hangar
cd /opt/hangar
```

## 5. Configurar
```
cp deploy/env.exemplo .env
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "DB_PASSWORD=$(openssl rand -hex 32)"
nano .env
```
No `nano`, preencha: `DOMAIN`, `DB_PASSWORD`, `JWT_SECRET` (cole os dois valores gerados acima), `GOOGLE_CLIENT_ID` e `ADMIN_EMAILS` (o seu e-mail do Google). Salve com **Ctrl+O, Enter** e saia com **Ctrl+X**.

> O `.env` guarda segredos. Ele **não** vai para o GitHub e não deve ser enviado a ninguém.

## 6. Liberar só o necessário no firewall
```
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

## 7. Subir o sistema
```
docker compose up -d --build
docker compose ps
docker compose logs -f app
```
A primeira vez demora uns minutos (compila o site). Você deve ver `migração aplicada` e `API ouvindo`. Saia dos logs com **Ctrl+C**.
O HTTPS é emitido sozinho pelo Caddy quando o DNS já está apontando. Abra `https://seu-dominio`.

## 8. Primeiro acesso
1. No Google Cloud, confirme que `https://seu-dominio` está em **Origens JavaScript autorizadas** e que o app está **Publicado**.
2. Abra o site e entre com o Google usando o e-mail de `ADMIN_EMAILS`: você já entra como admin.
3. Os outros pilotos caem na tela "Aguardando aprovação" e aparecem em **Painel admin → Aprovações**.

## Atualizar o sistema depois
Na sua máquina, faça as alterações e envie (`git push`). Na VPS:
```
cd /opt/hangar
git pull
docker compose up -d --build
```
Os dados ficam no volume do banco e **não** são apagados na atualização.

## Backup
- Um backup do banco é gerado **todo dia**, na pasta `/opt/hangar/backups` (mantém 14 diários, 4 semanais e 6 mensais).
- **Copie para fora da VPS de vez em quando**, para não perder tudo se o servidor falhar. No PowerShell do Windows:
  ```
  scp -r root@IP-DA-VPS:/opt/hangar/backups C:\Users\User\Documents\backups-hangar
  ```
- Ative também o **backup/snapshot da VPS** no painel da Hostinger, se o plano oferecer.
- **Restaurar** um backup (troque o arquivo pelo nome real, que fica em `backups/daily/`):
  ```
  cd /opt/hangar
  docker compose stop app
  gunzip -c backups/daily/ARQUIVO.sql.gz | docker compose exec -T db psql -U hangar -d hangar
  docker compose start app
  ```
  Para restaurar num banco que já tem dados, apague e recrie antes: `docker compose exec db psql -U hangar -d postgres -c "drop database hangar" -c "create database hangar owner hangar"`.

## Segurança da VPS (faça uma vez)
- **Chave SSH em vez de senha:** no Windows, `ssh-keygen -t ed25519`, depois `ssh-copy-id` equivalente (copie o conteúdo de `C:\Users\User\.ssh\id_ed25519.pub` para `/root/.ssh/authorized_keys` na VPS). Depois que funcionar, desative a senha: `nano /etc/ssh/sshd_config` → `PasswordAuthentication no` → `systemctl restart ssh`.
- **Atualizações automáticas de segurança:** `apt install -y unattended-upgrades`.
- Só as portas 22, 80 e 443 ficam abertas (passo 6). O banco e o app **não** são expostos à internet.

## Se der problema
| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Site não abre / aviso de certificado | DNS ainda não aponta para a VPS | `nslookup seu-dominio`; espere e rode `docker compose restart caddy` |
| `docker compose up` pede variável | `.env` incompleto | Preencha tudo em `.env` (passo 5) |
| Erro "GOOGLE_CLIENT_ID ... formato inválido" | ID colado errado | Copie de novo do Google Cloud |
| "O login com Google falhou" | Origem não cadastrada ou app em modo Teste | Veja `GOOGLE-LOGIN.md` |
| Erro 502 | App ainda subindo ou caiu | `docker compose logs app` |
| Ver o que está acontecendo | | `docker compose logs -f --tail=100` |
| Reiniciar tudo | | `docker compose restart` |
