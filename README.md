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
