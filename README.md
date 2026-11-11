# chromebook-system

Sistema de agendamento de carrinhos de Chromebooks para uma escola. Plano, decisões e modelo de dados estão em [docs/PLANO.md](docs/PLANO.md).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `apps/api` | API em Next.js (Route Handlers), Drizzle ORM e migrations SQL em `drizzle/` |
| `apps/web` | Frontend React + Vite |
| `packages/shared` | Schemas Zod, enums e tipos compartilhados |

Requisitos: Node.js 22.12 ou superior e PostgreSQL 17 (local, apenas para os testes).

```bash
npm install
```

## Configuração do Supabase

1. **Authentication → Sign In / Providers**: desative "Allow new users to sign up". Só entram e-mails autorizados pelo administrador.
2. **Authentication → URL Configuration**: em *Site URL* e *Redirect URLs*, cadastre a origem do frontend e `/auth/callback`. Exemplo: `http://localhost:5173/auth/callback`.
3. **Project Settings → JWT Keys**: use as chaves de assinatura assimétricas (padrão em projetos novos). A API valida o token pelo JWKS do projeto.
4. **Data API**: não adicione o schema `app` aos *Exposed schemas*. As tabelas de negócio ficam acessíveis apenas pela API.

## Variáveis de ambiente

Copie os exemplos e preencha. Os arquivos `.env` e `.env.*` não são versionados.

- `apps/api/.env.example` → `apps/api/.env`
- `apps/web/.env.example` → `apps/web/.env`
- `apps/api/.env.test.example` → `apps/api/.env.test`

`SUPABASE_SERVICE_ROLE_KEY` e as URLs do banco existem somente na API. O frontend recebe apenas a URL do Supabase e a chave pública (anon/publishable).

## Link da agenda para os professores

Professores não fazem login. A agenda e as reservas exigem o código de acesso que vai no próprio link (`/?acesso=...`); sem ele, a página pede o link ao TI. O código é gerado pela migration e fica em **Administração do TI → Configurações**, onde o link pode ser copiado. "Gerar novo link" invalida o anterior na hora. O frontend guarda o código no navegador e retira o parâmetro da barra de endereço.

## Aprovação de reservas

O pedido do professor nasce **aguardando aprovação** e já segura o horário, para que dois professores não peçam o mesmo carrinho. O TI decide de duas formas:

- pelo link do e-mail (`/aprovacao?reserva=...&codigo=...`), sem login. O código é único por pedido; o banco guarda apenas o hash e o código é removido da fila de e-mails depois do envio;
- em **Administração do TI → Reservas**, na seção "Pedidos aguardando aprovação". A aba mostra quantos pedidos estão pendentes.

Recusar libera o horário e registra o motivo, que o professor vê ao abrir o pedido. A aprovação é recusada se, depois do pedido, a data foi bloqueada ou o carrinho desativado. Reservas criadas pelo TI logado já nascem aprovadas.

## E-mail dos pedidos

Cada pedido gera um e-mail com o link de aprovação para os endereços cadastrados em **Administração do TI → Configurações**. A mensagem é gravada na tabela `notification_outbox` na mesma transação da reserva e enviada logo após a resposta; se o envio falhar, o pedido continua registrado e o e-mail é reenviado com espera crescente (até 5 tentativas).

| Variável | Uso |
|---|---|
| `EMAIL_PROVIDER` | `console` (padrão, apenas registra no log) ou `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | obrigatórias quando `EMAIL_PROVIDER=resend` |
| `APP_PUBLIC_URL` | endereço do frontend usado no link de aprovação; sem ela, o e-mail orienta a aprovar pela área do TI |
| `CRON_SECRET` | protege `/api/internal/notifications/dispatch`, que reprocessa pendentes |

`apps/api/vercel.json` agenda o reprocessamento uma vez por dia, o limite do plano Hobby. A Vercel envia `Authorization: Bearer <CRON_SECRET>` automaticamente. Em outro agendador, chame o endpoint com o mesmo cabeçalho.

## Banco de dados

```bash
npm run db:migrate -w @chromebook/api
```

Usa `DIRECT_DATABASE_URL` (conexão de sessão, porta 5432) se existir; caso contrário, `DATABASE_URL`. As migrations ficam em `apps/api/drizzle/` e nunca são editadas depois de aplicadas. Mudanças entram em uma nova migration registrada em `drizzle/meta/_journal.json`.

## Primeiro administrador

Não há usuário nem senha padrão no código. Com `apps/api/.env` preenchido e as migrations aplicadas:

```bash
npm run create-admin -w @chromebook/api -- --email admin@escola.com.br --name "Nome do Administrador"
```

O script cria a conta no Supabase Auth (sem senha) e registra o perfil `ADMIN` em `app.users`. Depois, o administrador entra pela tela de login com o link enviado ao e-mail e autoriza os demais usuários em **Administração → Usuários**.

## Desenvolvimento

```bash
npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173
```

## Modo demonstração (sem Supabase)

Roda API e frontend com dados fictícios. A agenda (`/`) é pública; a área do TI (`/admin`) usa um login de desenvolvimento por escolha de usuário, sem e-mail. Usa um banco separado (`chromebook_demo`).

1. Crie o banco: `create database chromebook_demo owner chromebook_dev;`
2. Copie `apps/api/.env.demo.example` para `apps/api/.env.demo` (defina `DEV_AUTH_SECRET` com 32+ caracteres aleatórios) e `apps/web/.env.demo.example` para `apps/web/.env.demo`.
3. Aplique as migrations e os dados:

```bash
npm run db:migrate:demo -w @chromebook/api
npm run db:seed-demo -w @chromebook/api
```

4. Em dois terminais:

```bash
npm run dev:demo -w @chromebook/api
npm run dev:demo -w @chromebook/web
```

O login de desenvolvimento só existe quando `DEV_AUTH_SECRET` está definido; a API recusa iniciar com essa variável em produção, e o frontend só ativa o modo em `vite dev`.

## Testes

Os testes de integração usam um PostgreSQL real local, em um banco dedicado `chromebook_test`. O setup recria o schema `app` a cada execução e se recusa a rodar em bancos cujo nome não termine em `_test`.

Preparação, feita uma única vez, no seu terminal. O `psql` pede a senha do usuário `postgres`; escolha uma senha para o usuário de teste:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d postgres -v test_password=SENHA_DE_TESTE -f apps/api/test/setup-test-db.sql
```

Depois, crie `apps/api/.env.test` com a mesma senha:

```
TEST_DATABASE_URL=postgres://chromebook_test:SENHA_DE_TESTE@localhost:5432/chromebook_test
```

Para executar:

```bash
npm test -w @chromebook/api
npm run typecheck
```
