# Sistema de Agendamento de Chromebooks — Plano (Etapa 1)

## Contexto

Repositório `D:\chromebook_system` está vazio (git iniciado, branch `main` sem commits). Não há código a reaproveitar; o projeto parte do zero.

Objetivo: professor acessa um link, vê a agenda (FullCalendar), consulta disponibilidade por carrinho e reserva um carrinho inteiro. Admin gerencia carrinhos, Chromebooks, reservas, bloqueios, feriados, horário de funcionamento e usuários autorizados, e recebe e-mail a cada reserva confirmada. Toda regra é validada no backend e a não sobreposição é garantida pelo PostgreSQL.

Entregável da Etapa 1 (após aprovação deste plano): gravar este conteúdo em `docs/PLANO.md` no repositório. Nenhum scaffolding ou código nesta etapa; a estrutura é criada no início da Etapa 2.

Observação: as imagens de referência visual mencionadas não chegaram nesta conversa. Elas serão necessárias na Etapa 4.

## Versões (consultadas no registro npm em 10/11/2026; reconfirmar na documentação oficial ao instalar)

| Item | Versão alvo | Observação |
|---|---|---|
| Node.js | 22 LTS (local: 22.20) | Vite 8 e Vitest 5 exigem >= 22.12 |
| React | 19.3.x | |
| Vite | 8.3.x | |
| Next.js | 16.4.x | apenas Route Handlers (API); `middleware` passou a se chamar `proxy` no 16 |
| FullCalendar | 7.1.x (`@fullcalendar/react`, `daygrid`, `timegrid`, `list`, `interaction`) | v7 exige `temporal-polyfill` como peer |
| TypeScript | 6.0.x | 7.0 (port nativo, jul/2026) adiado até confirmar compatibilidade com Next e typescript-eslint |
| Drizzle ORM | 0.45.x | não usar a linha 1.0 (ainda RC); migrations aplicadas pelo migrator do próprio `drizzle-orm` |
| Driver PG | `postgres` (postgres.js) | confirmar compatibilidade da v4 com Drizzle 0.45; senão fixar 3.4.x |
| `@supabase/supabase-js` | 2.x | frontend (auth) e backend (Admin API) |
| `jose` | atual | validação do JWT via JWKS |
| Zod | 4.x | validação compartilhada |
| TanStack Query | 5.x | cache e invalidação da agenda |
| React Router | 7.18.x | a v8 exige Node >= 22.22 (local: 22.20) |
| Vitest | 5.x | integração contra PostgreSQL 17 instalado localmente (sem Docker) |
| PostgreSQL | 17 (confirmar versão do projeto Supabase) | mesma imagem nos testes |

## Decisões principais

1. **Monorepo com npm workspaces**: `apps/web` (Vite), `apps/api` (Next.js), `packages/shared` (schemas Zod, tipos e constantes de domínio). Justificativa: o mesmo schema valida o formulário e a API sem duplicação; o backend continua sendo a autoridade. Sem Turborepo/Nx.
2. **Next.js só como API.** Funciona, mas é mais pesado que o necessário para uma API pura; mantido porque é requisito. Frontend e API ficam em projetos Vercel separados, por isso CORS explícito com lista de origens em `ALLOWED_ORIGINS`.
3. **Persistência: Drizzle ORM + postgres.js + migrations SQL versionadas, escritas à mão em `apps/api/drizzle/` e registradas em `meta/_journal.json`.** O `drizzle-kit` foi removido por não ser necessário (e trazia um alerta de segurança transitivo).
   - Mais próximo de "SQL explícito + Flyway" do que Prisma; aceita migrations customizadas para `btree_gist`, `EXCLUDE`, coluna gerada `tsrange` e `GRANT/REVOKE`, que Prisma não modela.
   - Transações explícitas (`db.transaction`) e captura de SQLSTATE (`23P01`, `23505`).
   - Conexão via Supavisor em modo transação (porta 6543) com `prepare: false`, adequado a serverless.
   - Regra igual ao Flyway: migration aplicada nunca é editada.
4. **Datas sem UTC**: reserva guarda `reservation_date date` + `start_time time` + `end_time time` no horário de parede de São Paulo. Drizzle em `mode: 'string'` para `date`/`time`, assim nada passa por `Date` do JS. "Agora" é calculado sempre em `America/Sao_Paulo` (constante no código, não configurável).
5. **Concorrência no banco**: `EXCLUDE USING gist (cart_id WITH =, period WITH &&) WHERE (status = 'CONFIRMED')`, com `period = tsrange(date+start, date+end, '[)')`. O intervalo semiaberto permite 08:00–09:00 seguido de 09:00–10:00. Cancelada sai do índice. A violação (`23P01`) vira HTTP 409.
   - Inserções simultâneas na mesma faixa podem gerar deadlock (`40P01`) na verificação da restrição. A transação é repetida até 3 vezes e, na nova tentativa, resulta em 409 ou na reserva já existente.
   - Se a violação vier de um clique repetido (mesma `Idempotency-Key`), a API devolve a reserva já criada em vez de 409.
   - `btree_gist` fica no schema `extensions`, como recomenda o Supabase.
6. **Idempotência**: o frontend gera um UUID por intenção de reserva e envia no header `Idempotency-Key`. Há `UNIQUE (user_id, idempotency_key)` e `request_hash`. A API faz `INSERT ... ON CONFLICT DO NOTHING`; havendo conflito com o mesmo hash, devolve a reserva existente (200), e com hash diferente, 422. O botão também fica desabilitado durante o envio, mas a proteção real é a do banco.
7. **Autenticação (Supabase Auth, magic link)**:
   - Cadastros públicos desativados no Supabase.
   - Quando o admin autoriza um e-mail, a API cria o usuário em `auth.users` via Admin API (service role, só no backend) e o registro em `app.users` com perfil.
   - O frontend chama `signInWithOtp({ email, options: { shouldCreateUser: false } })` (fluxo PKCE no navegador). E-mail não autorizado não tem conta e não recebe link; a UI mostra uma mensagem genérica.
   - A API valida o Bearer token (assinatura via JWKS, `iss`, `aud`, `exp`) e carrega perfil e status de `app.users`. **O perfil nunca vem de `user_metadata`**, que o próprio usuário pode alterar.
   - Primeiro admin: script `npm run create-admin -w apps/api -- --email ... --name ...`, que lê `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` do ambiente. Sem senha, sem e-mail fixo no código.
8. **Tabelas fora da API pública do Supabase**: todas no schema `app` (não exposto ao PostgREST), com RLS habilitado e sem policies, e `REVOKE ALL ... FROM anon, authenticated`. Apenas o backend acessa, pela connection string.
9. **E-mail (outbox transacional)**: a linha em `app.notification_outbox` é inserida na mesma transação da reserva. Depois do commit, `after()` do Next tenta o envio sem bloquear a resposta. Um endpoint interno protegido por `CRON_SECRET` reprocessa pendentes (`FOR UPDATE SKIP LOCKED`, `max_attempts` = 5, backoff, `last_error` sanitizado). A resposta ao professor é 201 independentemente do e-mail. Interface `EmailSender` com `ResendEmailSender` (HTTP simples, uma dependência), `ConsoleEmailSender` (dev) e `FakeEmailSender` (testes).
10. **Bloqueios × reservas concorrentes**: a reserva verifica bloqueios dentro da própria transação. Ao criar um bloqueio, a API retorna as reservas afetadas para o admin decidir; nada é cancelado automaticamente. A janela de corrida entre as duas operações é aceitável porque o admin sempre vê a lista de afetadas após o commit.
11. **CSS com variáveis** (folha global na Etapa 2; CSS Modules quando os componentes da agenda crescerem), sem Tailwind, para não adicionar dependência.

## Modelo de dados (schema `app`)

Todas as tabelas têm `id uuid PK default gen_random_uuid()` (exceto `school_settings`) e `created_at`/`updated_at timestamptz not null default now()`, com `updated_at` mantido por trigger.

- **users**: `id` (= `auth.users.id`), `email citext unique`, `name`, `role` (`PROFESSOR`|`ADMIN`), `active bool`. Desativar em vez de excluir.
- **carts**: `name citext unique`, `description`, `color` (check `^#[0-9a-fA-F]{6}$`), `display_order`, `active`. Seed: nenhum. Acer e Samsung são cadastrados pela tela de admin (ou por um seed opcional de dev).
- **chromebooks**: `asset_tag citext unique` (identificação única), `name`, `brand_model`, `cart_id FK not null`, `status` (`AVAILABLE`|`MAINTENANCE`|`INACTIVE`). Índice `(cart_id, status)`. Contagem por carrinho via `GROUP BY`/`FILTER`.
- **reservations**: `cart_id FK`, `user_id FK`, `class_name`, `reservation_date date`, `start_time time`, `end_time time`, `period tsrange GENERATED ALWAYS AS (...) STORED`, `status` (`CONFIRMED`|`CANCELLED`), `notes`, `idempotency_key uuid`, `request_hash`, `cancelled_at`, `cancelled_by FK users`, `cancel_reason`.
  - Checks: `end_time > start_time` e `status = 'CANCELLED'` implica `cancelled_at` preenchido.
  - `EXCLUDE` descrito acima, `UNIQUE (user_id, idempotency_key)`.
  - Índices em `(reservation_date)` e `(user_id, reservation_date)`.
  - Sem `ON DELETE CASCADE`; FKs com `RESTRICT`.
- **calendar_blocks**: `kind` (`BLOCK`|`HOLIDAY_NATIONAL`|`HOLIDAY_STATE`|`HOLIDAY_MUNICIPAL`|`SCHOOL_RECESS`), `start_date`, `end_date` (check `>= start_date`), `reason not null`, `cart_id FK null` (null = todos os carrinhos), `created_by`. Índice GiST em `daterange(start_date, end_date, '[]')`. Feriados e recessos são cadastrados por data; o filtro por ano é `extract(year ...)`. Unifica bloqueios e feriados numa tabela só porque a regra de validação é a mesma.
- **school_settings**: linha única (`id smallint PK check (id = 1)`), `opening_time`, `closing_time` (check `closing > opening`), `slot_minutes` (5, 10, 15, 20, 30 ou 60). Valores iniciais: 07:00 às 18:00, granularidade de 5 minutos. `notification_emails` entra na Etapa 5. Mesmo horário de segunda a sexta nesta versão.
- **notification_outbox**: `type`, `reservation_id FK`, `recipient`, `payload jsonb`, `status` (`PENDING`|`SENT`|`FAILED`), `attempts`, `max_attempts`, `next_attempt_at`, `last_error`, `sent_at`. Índice parcial `(next_attempt_at) WHERE status = 'PENDING'`.

## API (Route Handlers em `apps/api/src/app/api/...`)

Resposta de erro padrão: `{ code, message, details? }`, sem stack nem SQL.

- `GET /api/me`
- `GET /api/calendar?from&to&cartId`: reservas confirmadas (nome do professor, turma, horários, carrinho, sem e-mail), bloqueios, horário de funcionamento e carrinhos com quantidade operacional.
- `GET /api/availability?date&cartId`: intervalos livres por carrinho no dia.
- `POST /api/reservations` (`Idempotency-Key`): 201, 200 (repetição), 409 (conflito), 422 (regra violada).
- `GET /api/reservations/:id`; `POST /api/reservations/:id/cancel`: dono com reserva futura, ou admin.
- Admin (`/api/admin/...`):
  - `users`: autorizar, editar e desativar e-mails.
  - `carts`, `chromebooks`: criar, editar e inativar, sem DELETE. Mudança que reduz disponíveis retorna as reservas futuras afetadas.
  - `reservations`: listar, editar (409 em conflito) e cancelar.
  - `blocks`: CRUD, com `?preview=true` para listar afetadas antes de salvar.
  - `settings`: GET e PUT.
- `POST /api/internal/notifications/dispatch`: protegido por `CRON_SECRET`.

Camadas no backend: `route.ts` fino → `modules/<domínio>/service.ts` (regras) → `repository.ts` (Drizzle). Também `lib/auth` (verificação de token e `requireRole`), `lib/http` (erros e CORS), `lib/time` (agora em São Paulo). As dependências (`TokenVerifier`, `EmailSender`, `Clock`) são injetadas por uma fábrica simples, para os testes trocarem as implementações.

Regras validadas em `reservations/service` (dentro da transação): dia útil, sem bloqueio ou feriado para o carrinho ou para todos, data/hora não passadas, `end > start`, dentro do horário de funcionamento e alinhado a `slot_minutes`, carrinho ativo. Professor não envia `user_id`; ele vem do token.

## Estrutura do projeto

```
chromebook_system/
  package.json            (workspaces)
  .gitignore  .gitattributes  .nvmrc  README.md
  docs/PLANO.md
  packages/shared/src/    (schemas zod, enums, tipos de DTO)
  apps/api/
    drizzle/              (migrations SQL)
    src/app/api/...       (route handlers)
    src/modules/{users,carts,chromebooks,reservations,blocks,settings,notifications}/
    src/lib/{db,auth,http,time,email}/
    scripts/create-admin.ts
    test/                 (integração com PostgreSQL local, banco chromebook_test)
  apps/web/
    src/pages/{AgendaPage,LoginPage,AuthCallback,admin/*}
    src/components/{calendar,reservation-form,ui}/
    src/api/              (cliente HTTP + hooks TanStack Query)
    src/lib/supabase.ts   (só URL e publishable/anon key)
```

Variáveis (exemplos em `apps/api/.env.example`, `apps/api/.env.test.example` e `apps/web/.env.example`):
- API: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`, `APP_PUBLIC_URL`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.
- Web: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Frontend (resumo para a Etapa 4)

- A agenda é a rota `/`, com FullCalendar em `pt-br`, formato 24h e `firstDay` segunda.
- Visões `dayGridMonth` e `timeGridWeek`; `listDay` automática abaixo de 768px.
- Botões "Hoje", navegação e "Agendar" em destaque. Filtro por carrinho com uma cor por carrinho (cadastrada) e legenda textual.
- Dias bloqueados com fundo e rótulo ("Bloqueado: motivo"). "Sem reservas" e "Com reservas – horários disponíveis" indicados por texto ou ícone no dia, nunca "lotado" por existir reserva.
- Clique no dia abre um painel com as reservas e o botão "Agendar neste dia" (data preenchida).
- Formulário → resumo → confirmar. No 409, mostra a mensagem de conflito e invalida as queries de disponibilidade.
- Estados: carregando, vazio, erro, confirmação.
- A forma de passar o fuso ao FullCalendar 7 (timeZone nomeado via Temporal × strings "flutuantes") será verificada na documentação na Etapa 4.

## Testes prioritários (Vitest + PostgreSQL 17 local, sem Docker)

Banco real com as mesmas migrations:
- sobreposição no mesmo carrinho (409);
- concorrência com N `POST` simultâneos (`Promise.all`), dos quais exatamente 1 é confirmado;
- consecutivos 08–09 e 09–10 aceitos;
- carrinhos diferentes no mesmo horário;
- sábado, domingo, bloqueio global, bloqueio por carrinho, feriado, passado, `end <= start`, fora do horário de funcionamento;
- cancelamento liberando o horário;
- mesma `Idempotency-Key` sem duplicar, e chave igual com payload diferente → 422;
- permissões: professor cancelando reserva alheia → 403, professor em rota admin → 403, usuário inativo → 401/403;
- `FakeEmailSender` lançando erro → reserva permanece e outbox fica `PENDING`/`FAILED` após o limite;
- tabelas de negócio inacessíveis ao papel `anon` (teste de `GRANT`).

Os tokens de teste são assinados com chave local e o `TokenVerifier` é injetado.

## Etapas

1. **(esta)** Plano gravado em `docs/PLANO.md`.
2. Scaffolding do monorepo, migrations iniciais, auth (verificação de token, `create-admin`, autorização de e-mails), CRUD admin de carrinhos e Chromebooks, com testes de permissão.
3. Disponibilidade, reservas, `EXCLUDE`, idempotência e testes de concorrência.
4. Agenda e formulário integrados.
5. Bloqueios e feriados com afetadas, cancelamentos, configurações e outbox de e-mail.
6. Testes finais, README (setup Supabase, primeiro admin, deploy Vercel, cron), revisão de segurança.

## Fluxo de trabalho e Git

- Cada etapa termina com um relatório: o que foi implementado, como executar e verificar, testes que passaram e pendências.
- Depois da aprovação explícita do responsável, o Claude pode fazer commit e push direto na `main` (remote `chromebook-system`).
- Sem aprovação, nada é commitado nem enviado. Nunca usar `push --force` nem reescrever o histórico.

## Verificação da Etapa 1

- `docs/PLANO.md` existe no repositório com este conteúdo. Não há código para executar nesta etapa.

## Decisões pendentes (não bloqueiam a Etapa 2)

- **Plano da Vercel**: o Hobby limita cron a 1x/dia, o que afeta a frequência de reenvio de e-mails. Alternativa: disparar o reprocessamento também a cada nova reserva ou login de admin.
- **Provedor de e-mail**: Resend por padrão. SMTP da escola é possível trocando a implementação de `EmailSender`.
- **Imagens de referência visual**: enviar antes da Etapa 4.
- **Horário de funcionamento por dia da semana**: nesta versão é único de segunda a sexta. Confirmar se basta.
