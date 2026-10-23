# Plano de Implementação: Landing Page Barbearia VIP (campanha com influencers)

> **Para o executor:** este plano é para ser seguido tarefa por tarefa. Cada tarefa tem arquivos, passos, verificação e commit. Use TDD onde indicado: escreva o teste, veja falhar, implemente, veja passar, commite.

**Objetivo:** uma landing page única onde visitantes vindos de links de influencers fazem um pré-cadastro, que é enviado ao sistema da Barbearia VIP, e, **se nunca consumiram na Barbearia VIP**, recebem na hora um voucher de 10% de desconto válido por 7 dias. Quem já é cliente com alguma venda registrada não recebe o desconto. Cada lead e cada voucher ficam atribuídos ao influencer que gerou a visita. No balcão, o barbeiro valida o voucher e o "queima" com o PIN da sua unidade, registrando data/hora e unidade de uso.

**Stack escolhida:** Next.js 15 (App Router) + TypeScript + Tailwind CSS, Prisma + PostgreSQL (Neon ou Supabase; SQLite em dev), Zod, Vitest (unitário), Playwright (E2E), deploy na Vercel. Cloudflare Turnstile contra bots.

**Por que essa stack:** uma única aplicação resolve página pública, server actions para o formulário, rotas de API para resgate do voucher e painel de atribuição. Deploy gratuito na Vercel, banco gratuito na Neon. Sem filas nem infraestrutura extra.


> **Atualização em 23/10/2026:** hospedagem passou de Vercel para **VPS próprio com nginx** (`indicacao.barbeariavip.com.br`, ver `deploy/DEPLOY.md`; o cron virou crontab). Anti-bot passou de Turnstile para **Google reCAPTCHA v3**. Marca aplicada (logo, ícone, cor `#D9B437`, og-image). `SC 401 - ANTIGA` confirmada inativa (30 unidades ativas). Onde este documento ainda cita Vercel, Neon ou Turnstile, leia VPS/Postgres local/reCAPTCHA.
>
> **Status em 22/10/2026 (fim do dia):** Tarefas 1 a 13 implementadas e verificadas (244 testes unitários/integração, 5 cenários E2E, build e lint limpos). Decisões de execução que diferem do texto original: Next.js 16 (não 15; `proxy.ts` no lugar de `middleware.ts`), Prisma 7 com Postgres também em dev e teste (SQLite não suporta enums), rate limit em memória, bloqueio de PIN em memória. Pendente: Tarefa 14 (ativar API real), analytics (Tarefa 12, só o evento `bvip:analytics` está emitido), conteúdo definitivo, e o repositório no GitHub. Detalhes operacionais no README.

---

## 1. Fluxo ponta a ponta

```
Influencer posta link  ──►  /i/<slug>  ──►  cookie bvip_ref + registro de clique  ──►  / (landing)
                                                                                         │
                                                   etapa 1: nome + WhatsApp + unidade
                                                                                         │
                                                                                         ▼
                                                  Server Action verificarElegibilidade(telefone)
                                                    GET /api/agendas/getCliente?telefone=...
                                                      ├─ não encontrou ──────────────────────────► ELEGÍVEL (cliente novo)
                                                      └─ encontrou [ids] → p/ cada id:
                                                           GET /api/agendas/getConsumoCliente?id=...
                                                             ├─ historico vazio em todos ────────► ELEGÍVEL (cadastro sem consumo)
                                                             └─ qualquer venda ───────────────────► NEGADO → /ja-cliente
                                                                                         │ elegível
                                                                                         ▼
                                                   etapa 2: email + nascimento + consentimento
                                                                                         │
                                                                                         ▼
                                                          Server Action criarPreCadastro()
                                                            1. valida (Zod) + Turnstile + rate limit
                                                            2. normaliza telefone (+55...)
                                                            3. dedupe por telefone/email
                                                            4. RE-verifica elegibilidade (decisão final no servidor)
                                                            5. grava Lead (com influencer, UTM, elegibilidade)
                                                            6. cliente novo → POST /api/clientes/novo
                                                               cadastro sem consumo → reaproveita o id existente
                                                            7. gera Voucher (10%, expira em 7 dias)
                                                                                         │
                                                                                         ▼
                                                     /voucher/<codigo>  (código, QR, validade, compartilhar)
                                                                                         │
                                                                                         ▼
                                   Barbeiro valida em /balcao (PIN da unidade) e QUEIMA o voucher:
                                   status USED + usedAt + unidade  (resgate único, auditado)
```

---

## 2. Decisões de arquitetura

| Tema | Decisão | Motivo |
|---|---|---|
| Atribuição | **First-touch** por cookie `bvip_ref` (30 dias), gravado também em `?ref=` na URL e no lead | O primeiro influencer que trouxe a pessoa recebe o crédito; é a regra mais comum em campanhas de afiliados e evita disputas |
| Link do influencer | `https://<dominio>/i/<slug>` (curto, memorável) que redireciona para `/?ref=<slug>&utm_source=<slug>&utm_medium=influencer` | Link curto para bio/stories; UTM preservado para GA4/Meta Pixel |
| Identidade do lead | Telefone (WhatsApp) normalizado em E.164 é a chave de deduplicação local; email também é único porque a API exige | Barbearia agenda por WhatsApp; a API deles deduplica por email |
| Unidade de preferência | O visitante escolhe uma das 31 unidades (a confirmar: lista recebida tem 31, briefing dizia 29) no formulário (obrigatório na API); o voucher **vale em qualquer unidade** | A unidade escolhida é referência de cadastro, não restrição. Restringir reduziria conversão e a queima já registra a unidade real |
| Formulário em 2 etapas | Etapa 1: nome, WhatsApp, unidade. Etapa 2: email, nascimento, consentimento | A API exige 6 campos; dividir mantém a primeira tela leve e permite medir abandono entre etapas |
| Um voucher por pessoa | Índice único `Voucher.leadId`; telefone repetido devolve o voucher existente se ainda válido | Evita farm de vouchers |
| Validade | `expiresAt = issuedAt + 7 × 24h` (UTC no banco, exibido em `America/Sao_Paulo`) | Simples e sem ambiguidade de fuso; se preferir "até 23:59 do 7º dia", é uma linha para ajustar |
| Elegibilidade | Desconto **só para quem nunca consumiu** na Barbearia VIP. Consulta por telefone (`getCliente`, dígitos nacionais sem `55`); se existir cliente, consulta `getConsumoCliente` de cada id; **qualquer item em `historico` nega**. `pontuacoes` não entra na regra | Regra confirmada pelo cliente em 22/10. A decisão é tomada no servidor, na submissão final, mesmo que já tenha sido feita na etapa 1 |
| Autenticação na API | Hoje a API é aberta (confirmado em 22/10); autenticação está sendo criada. Toda chamada sai **apenas do nosso servidor**, nunca do navegador, e o `HttpClient` tem um ponto único (`authHeaders()`) que lê `BARBEARIA_VIP_AUTH_SCHEME` + `BARBEARIA_VIP_API_KEY` | Quando o mecanismo sair, muda uma função e duas variáveis de ambiente, sem tocar no resto |
| Cliente cadastrado sem consumo | É elegível. Não chamamos `POST /clientes/novo` (daria duplicado); gravamos o `id` existente como `externalId` e `syncStatus = SYNCED_EXISTING` | Evita erro de duplicidade e mantém o vínculo com o cadastro real |
| Falha na API na verificação de elegibilidade | **Fail-closed**: sem resposta da API, não emitimos voucher. O lead é salvo com `eligibility = UNKNOWN`, o visitante vê "não conseguimos confirmar agora, tente em instantes", e o cron re-verifica; se elegível, emite o voucher e a pessoa recupera em `/meu-voucher` | Emitir sem confirmar abriria brecha para dar desconto a cliente antigo, que é exatamente o que a regra proíbe |
| Falha na API no cadastro (após elegibilidade confirmada) | O lead é salvo com `syncStatus = PENDING`, o voucher é emitido mesmo assim, e o cron repete o `POST` | Elegibilidade já foi confirmada; não frustrar o cliente por indisponibilidade na criação |
| Recuperar voucher | Página `/meu-voucher` pede WhatsApp + data de nascimento e mostra o voucher da pessoa | Cobre quem fechou a aba, quem ficou em `UNKNOWN` e foi liberado depois pelo cron, e quem já tinha voucher ativo |
| Integração com a API | Interface `BarbeariaVipClient` com `MockClient` agora e `HttpClient` quando a API for entregue | Permite construir e testar tudo sem a API |
| Unidades | Tabela `Unit` com as **29 filiais** da Barbearia VIP, cada uma com um único PIN de recepção (6 dígitos, hash no banco) | Decisão do cliente: um PIN por unidade basta. Permite saber **em qual unidade** cada voucher foi usado |
| Login do balcão | A recepção escolhe a unidade (lista ou link `/balcao/<slug>`) **e depois** digita o PIN; o PIN é verificado contra aquela unidade, não procurado entre as 29 | Com 29 PINs de 6 dígitos, buscar "qual unidade tem este PIN" tornaria chute por força bruta 29× mais fácil. Verificar por unidade + bloqueio após 5 erros fecha isso |
| Validação do voucher | Endpoint público só-leitura `GET /api/vouchers/[code]` que devolve estado (ativo, expirado, usado) sem alterar nada | Barbeiro confere antes de aplicar o desconto; cliente pode conferir pelo QR |
| Queima do voucher | `POST /api/vouchers/[code]/burn` com PIN da unidade: transição atômica `ACTIVE → USED`, gravando `usedAt`, `usedUnitId` e operador | Resgate único e irreversível; a atomicidade impede uso duplo em duas unidades ao mesmo tempo |
| Auditoria | Toda validação e tentativa de queima (aceita ou rejeitada) vai para `VoucherAudit` | Rastreia tentativas de fraude e dá base para disputas com influencers |
| Anti-abuso | Turnstile + honeypot + rate limit por IP (10/h) + um voucher por telefone | Campanha pública com desconto atrai bots |
| LGPD | Checkbox de consentimento obrigatório, política de privacidade, `consentAt` gravado, IP armazenado como hash | Obrigatório no Brasil para coleta de dados pessoais |

---

## 3. Modelo de dados (Prisma)

```prisma
model Influencer {
  id        String   @id @default(cuid())
  slug      String   @unique          // ex: "joaobarber"
  name      String
  handle    String?                   // @ no Instagram/TikTok
  platform  String?                   // instagram | tiktok | youtube | outro
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  clicks    Click[]
  leads     Lead[]
}

model Click {
  id           String     @id @default(cuid())
  influencerId String
  influencer   Influencer @relation(fields: [influencerId], references: [id])
  utmSource    String?
  utmMedium    String?
  utmCampaign  String?
  utmContent   String?
  referer      String?
  userAgent    String?
  ipHash       String?
  createdAt    DateTime   @default(now())
  @@index([influencerId, createdAt])
}

enum SyncStatus { PENDING SYNCED SYNCED_EXISTING DUPLICATE FAILED }

enum Eligibility {
  PENDING          // ainda não verificado
  ELIGIBLE_NEW     // telefone não existe na Barbearia VIP
  ELIGIBLE_NO_SALES// existe cadastro, sem nenhuma venda
  DENIED_HAS_SALES // existe cadastro com venda: sem desconto
  UNKNOWN          // API indisponível; cron re-verifica
}

model Lead {
  id           String      @id @default(cuid())
  name         String
  phone        String      @unique     // E.164: +5511999999999
  email        String      @unique     // obrigatório e único (exigência da API)
  birthDate    DateTime    @db.Date    // obrigatório (exigência da API)
  preferredUnitId String
  preferredUnit   Unit     @relation(fields: [preferredUnitId], references: [id])
  influencerId String?
  influencer   Influencer? @relation(fields: [influencerId], references: [id])
  utmSource    String?
  utmMedium    String?
  utmCampaign  String?
  utmContent   String?
  consentAt    DateTime
  ipHash       String?
  externalId   Int?                    // id devolvido por POST /api/clientes/novo ou já existente em getCliente
  eligibility          Eligibility @default(PENDING)
  eligibilityCheckedAt DateTime?
  eligibilityDetail    String?        // json resumido: ids encontrados, qtd de itens no historico (sem dados pessoais)
  eligibilityAttempts  Int         @default(0)
  syncStatus   SyncStatus  @default(PENDING)
  syncAttempts Int         @default(0)
  syncError    String?
  createdAt    DateTime    @default(now())
  voucher      Voucher?
  @@index([influencerId, createdAt])
}

model Unit {
  id        String   @id @default(cuid())
  slug        String   @unique        // ex: "centro", "shopping-norte"
  externalId  Int      @unique        // unidade_id no sistema da Barbearia VIP
  name        String                  // "Barbearia VIP - Centro"
  address     String?
  city        String?                 // para agrupar a lista de 29 no formulário
  pinHash   String                    // sha256(salt + PIN); PIN nunca em texto puro
  pinRotatedAt DateTime?              // última troca de PIN
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  vouchers  Voucher[]
  audits    VoucherAudit[]
  leads     Lead[]                    // leads que escolheram esta unidade
}

enum VoucherStatus { ACTIVE USED CANCELLED }

model Voucher {
  id              String        @id @default(cuid())
  code            String        @unique   // VIP-7KQ4M2
  leadId          String        @unique
  lead            Lead          @relation(fields: [leadId], references: [id])
  discountPercent Int           @default(10)
  issuedAt        DateTime      @default(now())
  expiresAt       DateTime
  status          VoucherStatus @default(ACTIVE)
  usedAt          DateTime?               // data/hora da queima
  usedUnitId      String?                 // unidade onde foi usado
  usedUnit        Unit?         @relation(fields: [usedUnitId], references: [id])
  usedBy          String?                 // nome do barbeiro/operador (opcional)
  audits          VoucherAudit[]
  @@index([expiresAt])
  @@index([usedUnitId, usedAt])
}

enum VoucherAuditAction { VALIDATED BURNED REJECTED }

model VoucherAudit {
  id        String             @id @default(cuid())
  voucherId String
  voucher   Voucher            @relation(fields: [voucherId], references: [id])
  unitId    String?
  unit      Unit?              @relation(fields: [unitId], references: [id])
  action    VoucherAuditAction
  reason    String?            // EXPIRED | ALREADY_USED | BAD_PIN | CANCELLED
  ipHash    String?
  createdAt DateTime           @default(now())
  @@index([voucherId, createdAt])
}
```

"Expirado" é derivado: `status === ACTIVE && expiresAt < now()`. Não precisa de job para expirar. "Usado" é um estado persistido (`USED`) porque precisa guardar data e unidade.

**Máquina de estados do voucher:**

```
ACTIVE ──(expiresAt passou)──► EXPIRED (derivado, só leitura)
ACTIVE ──(burn com PIN válido, antes de expirar)──► USED {usedAt, usedUnitId, usedBy}
ACTIVE ──(admin cancela)──► CANCELLED
USED / EXPIRED / CANCELLED: terminais, burn devolve 409
```

---

## 4. Estrutura de pastas

```
barbearia-vip-landing/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                     # influencers e unidades iniciais
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                # landing
│   │   ├── i/[slug]/route.ts       # link do influencer → cookie + clique → redirect
│   │   ├── voucher/[code]/page.tsx # página do voucher
│   │   ├── ja-cliente/page.tsx     # negado: já é cliente com consumo
│   │   ├── meu-voucher/page.tsx    # recuperar voucher por WhatsApp + nascimento
│   │   ├── balcao/page.tsx         # validador + queima (PIN da unidade)
│   │   ├── admin/page.tsx          # atribuição por influencer
│   │   ├── privacidade/page.tsx
│   │   └── api/
│   │       ├── vouchers/[code]/route.ts        # GET: validador (só leitura)
│   │       ├── vouchers/[code]/burn/route.ts   # POST: queima com PIN da unidade
│   │       ├── admin/export/route.ts      # CSV
│   │       └── cron/sync-leads/route.ts   # reprocessa sync PENDING/FAILED e elegibilidade UNKNOWN
│   ├── components/
│   │   ├── landing/ (Hero, ComoFunciona, ProvaSocial, Faq, Footer)
│   │   ├── PreCadastroForm.tsx
│   │   └── VoucherCard.tsx
│   ├── actions/
│   │   ├── verificar-elegibilidade.ts  # server action da etapa 1
│   │   └── criar-pre-cadastro.ts       # server action final
│   ├── lib/
│   │   ├── db.ts                  # PrismaClient singleton
│   │   ├── phone.ts               # normalização BR → E.164
│   │   ├── voucher-code.ts        # gerador de código
│   │   ├── voucher.ts             # regras: expiração, status derivado, burn
│   │   ├── eligibility.ts         # regra "nunca consumiu" sobre getCliente + getConsumoCliente
│   │   ├── unit-auth.ts           # valida PIN → Unit
│   │   ├── attribution.ts         # leitura/gravação de cookie ref + UTM
│   │   ├── rate-limit.ts
│   │   ├── turnstile.ts
│   │   ├── hash.ts                # sha256 de IP com salt
│   │   └── barbearia-vip/
│   │       ├── client.ts          # interface + factory
│   │       ├── mock-client.ts
│   │       └── http-client.ts     # implementado quando a API chegar
│   └── middleware.ts              # captura ?ref= em qualquer rota
├── tests/
│   ├── unit/   (phone, voucher-code, voucher, attribution, action)
│   └── e2e/    (fluxo completo em Playwright)
├── .env.example
└── README.md
```

---

## 5. API da Barbearia VIP (fornecida em 22/10/2026)

**Endpoint:** `POST https://franquiabv.com.br/api/clientes/novo`

| Campo | Tipo | Obrigatório | Como preenchemos |
|---|---|---|---|
| `nome` | string | sim | `Lead.name` |
| `email` | string | sim, **único** | `Lead.email` (passa a ser obrigatório no formulário) |
| `ddi` | string | sim | `"55"` fixo (só aceitamos celular brasileiro) |
| `telefone` | string | sim | número nacional sem `+55`, só dígitos: `48999999999` |
| `data_nascimento` | string | sim | `Lead.birthDate` formatado `dd-mm-aaaa` |
| `unidade_id` | int | sim | `Unit.externalId` da unidade escolhida no formulário |

**Retorno:** `{ sucesso: boolean, id?: number, mensagem?: string }`

**Consequências para o projeto:**

1. **Formulário cresce**: nome, email, WhatsApp, data de nascimento, unidade de preferência (lista das 29), consentimento. São 3 campos a mais do que o planejado. Para não derrubar a conversão, o formulário fica em **duas etapas**: (1) nome + WhatsApp + unidade; (2) email + nascimento + consentimento. O voucher só é emitido ao concluir a etapa 2.
2. **Email único no sistema deles**: se a API recusar por email duplicado, tratamos como cliente já existente (`syncStatus = DUPLICATE`), **não** bloqueamos o voucher. A API não devolve o `id` existente nesse caso, então `externalId` fica nulo.
3. **Unidades precisam do id numérico deles**: a planilha das 29 unidades deve trazer o `unidade_id` do sistema da Barbearia VIP. Vira `Unit.externalId`.
4. **Nenhum campo de origem/voucher**: a API não aceita influencer nem código de voucher. A atribuição e o estado do voucher vivem só no nosso banco (já era a decisão). Se quiser que o sistema deles saiba a origem, precisa de campo novo na API.
5. **Sem autenticação hoje** (confirmado em 22/10; um mecanismo está em desenvolvimento). O cliente HTTP concentra isso em `authHeaders()`: `BARBEARIA_VIP_AUTH_SCHEME` = `none` (padrão atual) | `bearer` | `api-key`, com `BARBEARIA_VIP_API_KEY`. Enquanto for `none`, nenhum header é enviado. Nossas rotas nunca expõem a API ao navegador: a landing só fala com o nosso servidor.

```ts
// src/lib/barbearia-vip/client.ts
export interface PreCadastroInput {
  nome: string;
  email: string;
  ddi: '55';
  telefone: string;         // dígitos nacionais, ex. "48999999999"
  data_nascimento: string;  // dd-mm-aaaa
  unidade_id: number;
}

export type PreCadastroResult =
  | { ok: true; externalId: number }
  | { ok: false; kind: 'DUPLICATE' | 'VALIDATION' | 'UNAVAILABLE'; mensagem?: string; httpStatus?: number };

export interface BarbeariaVipClient {
  criarCliente(input: PreCadastroInput): Promise<PreCadastroResult>;
}
```

### 5.1 Consultas para elegibilidade

**`GET https://franquiabv.com.br/api/agendas/getCliente?telefone=&unidade_id=&versao=`**

| Campo | Obrigatório | Como usamos |
|---|---|---|
| `telefone` | sim | dígitos nacionais **sem o `55`** e sem máscara (`48999999999`), mesmo formato do cadastro. Confirmado: não há segunda tentativa com prefixo |
| `unidade_id` | não | enviamos o `externalId` da unidade escolhida; só enriquece pontuação, não altera a busca |
| `versao` | não | **não enviar** (confirmado: desnecessário quando o telefone vai sem código do país) |

Retorno: `{ sucesso: boolean, clientes: [{ id: number, nome: string, ... }] }`. `sucesso: false` = nenhum cliente. A busca é **exata** pelo telefone (confirmado), então o formato dos dígitos precisa bater com o que está salvo no app: por isso normalizamos sempre para 11 dígitos nacionais. O array pode ter **mais de um** cliente para o mesmo telefone; todos são verificados.

**`GET https://franquiabv.com.br/api/agendas/getConsumoCliente?id=<id>`**

Retorno: `{ sucesso, cliente: {...}, historico: [...], pontuacoes: [...] }`. **Regra (confirmada):** `historico.length > 0` em qualquer um dos ids = já consumiu = **negado**. O histórico não inclui cancelamentos nem no-show, então não há falso negativo por atendimento que não aconteceu. `pontuacoes` é ignorado na decisão (só pode ser guardado como contagem em `eligibilityDetail` para análise).

**Algoritmo `checkEligibility(phoneE164, unitExternalId)`:**

```
1. telefone = splitForApi(phone).telefone
2. r = getCliente(telefone, unitExternalId)        // UNAVAILABLE → retorna UNKNOWN
3. se !r.sucesso ou r.clientes vazio               → ELIGIBLE_NEW
4. para cada c em r.clientes:
     h = getConsumoCliente(c.id)                   // UNAVAILABLE → retorna UNKNOWN (não arriscar)
     se h.historico.length > 0                    → DENIED_HAS_SALES
5. nenhum com venda                                → ELIGIBLE_NO_SALES, existingId = r.clientes[0].id
```

Toda a lógica fica em `src/lib/eligibility.ts`, pura, recebendo o client injetado, para testar sem rede.

```ts
export interface ClienteResumo { id: number; nome: string }
export type BuscarClienteResult =
  | { ok: true; clientes: ClienteResumo[] }
  | { ok: false; kind: 'UNAVAILABLE'; httpStatus?: number };
export type ConsumoResult =
  | { ok: true; historico: unknown[]; pontuacoes: unknown[] }
  | { ok: false; kind: 'NOT_FOUND' | 'UNAVAILABLE'; httpStatus?: number };

export interface BarbeariaVipClient {
  criarCliente(input: PreCadastroInput): Promise<PreCadastroResult>;
  buscarClientePorTelefone(telefone: string, unidadeId?: number): Promise<BuscarClienteResult>; // telefone sem 55; nunca envia `versao`
  consumoCliente(id: number): Promise<ConsumoResult>;
}
```

Classificação de erro no `HttpClient` (cadastro):
- resposta 2xx com `sucesso: true` → `ok`
- resposta com `sucesso: false` e `mensagem` contendo "e-mail"/"email" e "já"/"existe"/"cadastrado" → `DUPLICATE` (regra a confirmar com a mensagem real)
- outra `sucesso: false` → `VALIDATION` (não adianta repetir; registrar `mensagem`)
- timeout, 5xx, erro de rede → `UNAVAILABLE` (o cron repete)

---

## 6. Tarefas

### ✅ Tarefa 1: Scaffold do projeto

**Arquivos:** `package.json`, `tsconfig.json`, `tailwind.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`, `README.md`

- [ ] `npx create-next-app@latest barbearia-vip-landing --ts --tailwind --app --src-dir --eslint --no-import-alias`
- [ ] `npm i prisma @prisma/client zod libphonenumber-js qrcode` e `npm i -D vitest @vitejs/plugin-react @testing-library/react @playwright/test @types/qrcode tsx`
- [ ] `npx prisma init` e criar `.env.example` com: `DATABASE_URL`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `IP_HASH_SALT`, `PIN_SALT`, `ADMIN_TOKEN`, `CRON_SECRET`, `BARBEARIA_VIP_API_URL=https://franquiabv.com.br`, `BARBEARIA_VIP_AUTH_SCHEME=none` (trocar para `bearer` ou `api-key` quando a autenticação for lançada), `BARBEARIA_VIP_API_KEY` (vazio por enquanto), `BARBEARIA_VIP_CLIENT=mock`, `NEXT_PUBLIC_SITE_URL`
- [ ] Scripts no `package.json`: `test`, `test:e2e`, `db:migrate`, `db:seed`, `typecheck`
- [ ] Verificar: `npm run dev` sobe, `npm test` roda (0 testes), `npm run typecheck` passa
- [ ] Commit: `chore: scaffold next.js + prisma + vitest + playwright`

### ✅ Tarefa 2: Schema do banco e seed de influencers

**Arquivos:** `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`

- [ ] Copiar o schema da seção 3
- [ ] `src/lib/db.ts`: singleton do PrismaClient (padrão para dev com HMR)
- [ ] `prisma/seed.ts`: upsert de 2 ou 3 influencers de exemplo por `slug`; upsert de 2 unidades de exemplo com `pinHash` gerado a partir de `SEED_UNIT_PIN` (default `123456` só em dev)
- [ ] Script `npm run unit:import -- unidades.csv` para as **29 unidades reais**: lê `docs/data/unidades.csv` (colunas `slug,unidade_id,nome,endereco,cep,cidade,uf,telefone,tipo_telefone,horario,instagram,link_maps`), valida `unidade_id` numérico e único e slug único, e ignora linhas marcadas como inativas, gera um PIN aleatório de 6 dígitos por unidade (`crypto.randomInt`), grava só o hash e escreve `unidades-pins-<data>.csv` fora do repositório para distribuição às recepções. O arquivo de PINs deve ser apagado após a entrega
- [ ] Script `npm run unit:rotate-pin -- --slug centro` para trocar o PIN de uma unidade (vazamento, troca de equipe); atualiza `pinRotatedAt`
- [ ] `npx prisma migrate dev --name init` e `npm run db:seed`
- [ ] Verificar: `npx prisma studio` mostra as tabelas e os influencers
- [ ] Commit: `feat(db): schema de influencer, click, lead, voucher, unidade e auditoria + seed`

### ✅ Tarefa 3: Utilitários puros com TDD

**Arquivos:** `src/lib/phone.ts`, `src/lib/voucher-code.ts`, `src/lib/voucher.ts`, `src/lib/hash.ts`, testes em `tests/unit/`

- [ ] **phone.test.ts**: `(11) 99999-9999` → `+5511999999999`; `11 9 9999 9999` → mesmo; `+55 11 99999-9999` → mesmo; fixo `(11) 3333-3333` → inválido (exige celular); `123` → inválido
- [ ] Implementar `normalizeBrMobile(input): string | null` com `libphonenumber-js` (região `BR`, tipo `MOBILE`) e `splitForApi(e164)` → `{ ddi: '55', telefone: '48999999999' }`
- [ ] **date.test.ts**: `parseBirthDate('10/01/1990')` → `Date`; rejeita data futura, idade < 12 ou > 110, e `31/02`; `formatBirthDateForApi(date)` → `'10-01-1990'`
- [ ] **voucher-code.test.ts**: formato `/^VIP-[A-HJ-NP-Z2-9]{6}$/`; 10.000 gerações sem colisão; nunca contém `0 O 1 I`
- [ ] Implementar `generateVoucherCode()` com `crypto.randomInt` e alfabeto sem caracteres ambíguos
- [ ] **voucher.test.ts**: `computeExpiresAt(issuedAt)` = +7 dias exatos; `getVoucherState({status:'ACTIVE', expiresAt: ontem})` = `'EXPIRED'`; `ACTIVE` e futuro = `'ACTIVE'`; `USED` = `'USED'`; `CANCELLED` = `'CANCELLED'`; `canBurn(voucher, now)` só é `true` para `ACTIVE` não expirado
- [ ] Implementar `VOUCHER_VALIDITY_DAYS = 7`, `DISCOUNT_PERCENT = 10`, `computeExpiresAt`, `getVoucherState`, `canBurn`
- [ ] **unit-auth.test.ts**: `hashPin(pin)` determinístico com `PIN_SALT`; `verifyUnitPin(unitSlug, pin)` compara em tempo constante (`crypto.timingSafeEqual`) contra o hash **daquela** unidade; PIN com formato diferente de 6 dígitos é rejeitado antes de ir ao banco
- [ ] `hash.ts`: `hashIp(ip)` = sha256(`${salt}:${ip}`) em hex
- [ ] Verificar: `npm test` verde
- [ ] Commit: `feat(lib): normalização de telefone, código e regras de voucher`

### ✅ Tarefa 4: Rastreabilidade do influencer

**Arquivos:** `src/lib/attribution.ts`, `src/app/i/[slug]/route.ts`, `src/middleware.ts`, `tests/unit/attribution.test.ts`

- [ ] **attribution.test.ts**: `parseUtm(searchParams)` extrai `utm_source/medium/campaign/content`; `resolveRef({cookieRef, queryRef})` devolve o cookie se existir (first-touch), senão a query
- [ ] `attribution.ts`: constantes `REF_COOKIE = 'bvip_ref'`, `REF_COOKIE_MAX_AGE = 30 dias`, funções acima
- [ ] `src/app/i/[slug]/route.ts` (GET):
  - busca `Influencer` ativo pelo slug; se não existir, redireciona para `/` sem cookie
  - cria `Click` com UTM, referer, user-agent, ipHash (não bloquear o redirect se falhar: `try/catch` com `console.error`)
  - seta cookie `bvip_ref=<slug>` (httpOnly, sameSite lax, 30 dias) **somente se ainda não existir**
  - redireciona 302 para `/?ref=<slug>&utm_source=<slug>&utm_medium=influencer&utm_campaign=lancamento`
- [ ] `src/middleware.ts`: se qualquer rota chegar com `?ref=` e sem cookie, seta o cookie (cobre links colados sem `/i/`). Matcher exclui `/api`, `/_next`, assets
- [ ] Verificar manualmente: abrir `/i/joaobarber`, conferir cookie no DevTools e linha em `Click`; abrir `/i/naoexiste` cai na home sem cookie; abrir `/?ref=outro` depois **não** troca o cookie
- [ ] Commit: `feat(tracking): link /i/[slug], cookie first-touch e registro de cliques`

### ✅ Tarefa 5: Cliente da API da Barbearia VIP (mock + HTTP real)

**Arquivos:** `src/lib/barbearia-vip/client.ts`, `mock-client.ts`, `http-client.ts`, `tests/unit/barbearia-vip.test.ts`, `tests/unit/http-client.test.ts`

- [ ] `client.ts`: interface e tipos da seção 5 + `getBarbeariaVipClient()` que lê `BARBEARIA_VIP_CLIENT` (`mock` | `http`)
- [ ] `mock-client.ts`, cenários por sufixo do telefone (documentados no README para a equipe testar):
  - `criarCliente`: devolve `{ ok: true, externalId: <inteiro incremental> }` com latência de 100 ms; email terminando em `@dup.test` → `DUPLICATE`; telefone terminando em `0000` → `UNAVAILABLE`
  - `buscarClientePorTelefone`: termina em `1111` → cliente `id 901` sem consumo; `2222` → cliente `id 902` com consumo; `3333` → dois clientes (`903` sem, `904` com consumo); `9999` → `UNAVAILABLE`; qualquer outro → não encontrado
  - `consumoCliente`: `902`/`904` → `historico` com 1 item; `901`/`903` → vazios; id desconhecido → `NOT_FOUND`
- [ ] `http-client.ts`, consultas: `GET /api/agendas/getCliente` com `telefone` (sem `55`) e `unidade_id` em query string (`URLSearchParams`), sem `versao`; `GET /api/agendas/getConsumoCliente?id=`; `sucesso: false` no `getCliente` = lista vazia (não é erro); timeout 5 s cada; sem retry automático nas consultas (a server action decide)
- [ ] `http-client.ts`:
  - `POST ${BARBEARIA_VIP_API_URL}/api/clientes/novo`, `Content-Type: application/json`, corpo exatamente com os 6 campos
  - `authHeaders()`: `none` → sem header (estado atual); `bearer` → `Authorization: Bearer <key>`; `api-key` → `X-Api-Key: <key>`. Teste para cada esquema, para a troca futura ser só de env
  - Em 401/403 vindo da API (sinal de que a autenticação entrou no ar), classificar como `UNAVAILABLE` e logar alerta destacado, para o cron segurar os leads em vez de marcá-los como falha definitiva
  - timeout 8 s com `AbortController`; 1 retry imediato só para erro de rede/timeout
  - classifica a resposta conforme a tabela da seção 5; loga `mensagem` sem logar dados pessoais do cliente
- [ ] Testes do HTTP com `msw` (ou `fetch` mockado): `getCliente` monta a URL correta (`telefone=48999999999`, sem `55`, sem `versao`) e trata `sucesso:false` como vazio; `getConsumoCliente` devolve `historico` e `pontuacoes`; 500/timeout → `UNAVAILABLE`; corpo do `POST` enviado bate com o exemplo da documentação (`ddi: "55"`, `telefone` sem `+55`, `data_nascimento: "10-01-1990"`, `unidade_id` numérico); `{sucesso:true,id:123}` → `externalId 123`; `{sucesso:false,mensagem:"E-mail já cadastrado"}` → `DUPLICATE`; 500 → `UNAVAILABLE`; timeout → `UNAVAILABLE`
- [ ] Teste de fumaça manual **em homologação ou com um email de teste combinado com a Barbearia VIP** (não disparar cadastros falsos em produção): um `curl` com os dados do exemplo da documentação e anotar a `mensagem` real de duplicidade para ajustar a classificação
- [ ] Commit: `feat(integration): cliente HTTP de POST /api/clientes/novo com mock`

### ✅ Tarefa 5b: Regra de elegibilidade "nunca consumiu" (TDD)

**Arquivos:** `src/lib/eligibility.ts`, `src/actions/verificar-elegibilidade.ts`, `src/app/ja-cliente/page.tsx`, `tests/unit/eligibility.test.ts`

- [ ] **eligibility.test.ts** com client fake injetado:
  1. `getCliente` não encontra → `ELIGIBLE_NEW`, `existingId: null`, apenas 1 chamada à API
  2. encontra 1 cliente, `historico: []`, `pontuacoes: []` → `ELIGIBLE_NO_SALES`, `existingId: <id>`
  3. encontra 1 cliente com 1 item em `historico` → `DENIED_HAS_SALES`
  4. encontra 2 clientes, só o segundo tem consumo → `DENIED_HAS_SALES` (todos os ids são verificados)
  5. encontra cliente, `historico: []` mas `pontuacoes` com saldo > 0 → `ELIGIBLE_NO_SALES` (pontuação **não** desqualifica; só o histórico conta)
  6. `getCliente` → `UNAVAILABLE` → `UNKNOWN`
  7. `getConsumoCliente` → `UNAVAILABLE` em um dos ids → `UNKNOWN` (nunca liberar sem conferir todos)
  8. `getConsumoCliente` → `NOT_FOUND` para um id que `getCliente` devolveu → tratar como sem consumo, mas registrar em `eligibilityDetail`
  9. `detail` nunca contém nome, email ou telefone (só ids e contagens)
- [ ] Implementar `checkEligibility(client, phoneE164, unitExternalId): Promise<{ status, existingId, detail }>` conforme o algoritmo da seção 5.1, com as consultas de consumo em paralelo (`Promise.all`) limitadas a 5 ids
- [ ] Server action `verificarElegibilidade(phone, unitSlug)` chamada ao concluir a etapa 1: rate limit por IP (20/h) e por telefone (5/h), roda `checkEligibility` e devolve só `{ eligible: boolean | 'unknown' }` (não expõe ids nem nome do cliente ao navegador). Resultado também gravado em `Lead` parcial (`eligibility`, `eligibilityCheckedAt`) para o funil
- [ ] Página `/ja-cliente`: "Você já faz parte da Barbearia VIP". Texto claro de que o desconto é exclusivo para primeira visita, sem expor dados do cadastro, com CTA para agendar normalmente e link para o programa de fidelidade. Lead `DENIED` continua atribuído ao influencer (aparece no painel como "já cliente")
- [ ] Commit: `feat(eligibility): desconto apenas para quem nunca consumiu na Barbearia VIP`

### ✅ Tarefa 6: Server action de pré-cadastro + emissão do voucher (TDD)

**Arquivos:** `src/actions/criar-pre-cadastro.ts`, `src/lib/rate-limit.ts`, `src/lib/turnstile.ts`, `tests/unit/criar-pre-cadastro.test.ts`

- [ ] Schema Zod: `name` (2 a 80 chars, pelo menos nome e sobrenome, pois a API pede nome completo), `phone` (passa por `normalizeBrMobile`), `email` (obrigatório, minúsculo, trim), `birthDate` (passa por `parseBirthDate`), `unitSlug` (existe e está ativa), `consent` literal `true`, `website` (honeypot, deve ser vazio), `turnstileToken`
- [ ] Testes (Prisma mockado ou banco SQLite de teste; preferir banco de teste real com `vitest.setup` que roda `prisma migrate reset --force`):
  1. dados válidos → cria Lead, Voucher com `expiresAt = +7d`, `discountPercent = 10`, `influencerId` do cookie, retorna `{ ok: true, code }`
  2. telefone **ou email** já cadastrado com voucher ativo → **não** cria novo, retorna o código existente com `alreadyRegistered: true`
  3. telefone já cadastrado com voucher expirado → retorna `{ ok: false, reason: 'EXPIRED' }` (sem novo voucher)
  4. honeypot preenchido → retorna `ok: true` falso-positivo sem gravar nada (não dar dica ao bot)
  5. API devolve `UNAVAILABLE` → Lead com `syncStatus: FAILED`, `syncError` preenchido, voucher **emitido mesmo assim** (cron repete)
  5b. API devolve `DUPLICATE` → Lead com `syncStatus: DUPLICATE`, `externalId: null`, voucher emitido, cron **não** repete
  5c. API devolve `VALIDATION` → Lead com `syncStatus: FAILED`, `syncAttempts: 5` (não repetir), voucher emitido, alerta no painel para correção manual
  5d. API devolve `ok` → `syncStatus: SYNCED`, `externalId` numérico salvo
  6. consentimento ausente → erro de validação
  7. ref de influencer inexistente → lead salvo com `influencerId: null`
  8. elegibilidade `DENIED_HAS_SALES` na re-verificação → lead salvo como `DENIED`, **nenhum voucher**, redirect para `/ja-cliente` (mesmo que a etapa 1 tenha dito elegível, por exemplo se o telefone foi trocado no cliente)
  9. elegibilidade `UNKNOWN` → lead salvo com `eligibility: UNKNOWN`, nenhum voucher, resposta `{ ok: false, reason: 'UNAVAILABLE' }` com mensagem para tentar de novo
  10. elegibilidade `ELIGIBLE_NO_SALES` → **não** chama `criarCliente`; `externalId = existingId`, `syncStatus: SYNCED_EXISTING`, voucher emitido
- [ ] Implementação, em ordem:
  1. validar input; 2. verificar Turnstile (pular se `NODE_ENV === 'test'`); 3. rate limit por `ipHash` (tabela simples ou `Map` em memória com janela de 1 h, 10 tentativas); 4. `resolveRef` do cookie; 5. **`checkEligibility` (decisão final)**: `DENIED` → grava lead e `redirect('/ja-cliente')`; `UNKNOWN` → grava lead e devolve erro recuperável; 6. `prisma.$transaction`: upsert do lead por telefone + create do voucher (loop de até 3 tentativas se o código colidir); 7. fora da transação: se `ELIGIBLE_NEW`, montar `PreCadastroInput` (`splitForApi`, `formatBirthDateForApi`, `unit.externalId`) e chamar `criarCliente`; se `ELIGIBLE_NO_SALES`, só gravar `externalId = existingId`; atualizar `syncStatus`; 8. `redirect('/voucher/' + code)`
- [ ] Verificar: `npm test` verde
- [ ] Commit: `feat(leads): server action de pré-cadastro com voucher de 10% por 7 dias`

### ✅ Tarefa 7: Landing page

**Arquivos:** `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/landing/*`, `src/components/PreCadastroForm.tsx`, `src/app/privacidade/page.tsx`

- [ ] Estrutura mobile-first (tráfego de influencer é 90%+ celular):
  - **Hero**: headline com a oferta ("10% OFF no seu primeiro corte"), subtítulo com validade de 7 dias, CTA que rola até o formulário. Se houver `ref` com influencer válido, mostrar "Indicação de @handle" (prova social e confirmação visual do rastreio)
  - **Como funciona**: 3 passos (cadastre, receba o voucher, apresente no balcão)
  - **Formulário em 2 etapas** (um único `<form>`, etapas controladas no cliente, com fallback de página única sem JS):
    - Etapa 1: nome completo, WhatsApp com máscara, unidade de preferência (select agrupado por cidade, com busca; se a URL do influencer trouxer `?unidade=<slug>`, vem pré-selecionada). Ao avançar, chama `verificarElegibilidade`: elegível → etapa 2; negado → `/ja-cliente`; desconhecido → mensagem "não conseguimos confirmar agora, tente em instantes" com botão de tentar de novo (até 3 vezes; depois orienta a voltar mais tarde ou usar `/meu-voucher`)
    - Etapa 2: email, data de nascimento (máscara `dd/mm/aaaa`, teclado numérico), checkbox LGPD com link para `/privacidade`, campo honeypot oculto, widget Turnstile, botão "Gerar meu voucher" com loading
    - Texto curto explicando por que pedimos nascimento e unidade ("para seu cadastro no app da Barbearia VIP")
    - Erros inline por campo; voltar da etapa 2 para a 1 mantém os valores
  - Evento de analytics em cada etapa para medir abandono
  - **Prova social / fotos / endereço / horário** (conteúdo placeholder, a receber do cliente)
  - **FAQ**: validade, um voucher por pessoa, como usar, serviços elegíveis
  - **Rodapé**: CNPJ, Instagram, política de privacidade
- [ ] `layout.tsx`: metadados Open Graph (imagem 1200×630 para preview no WhatsApp/Instagram), `lang="pt-BR"`, fonte via `next/font`
- [ ] `PreCadastroForm.tsx`: `useActionState` com a server action; `ref` e UTM vêm do cookie no servidor, não do cliente
- [ ] Verificar: Lighthouse mobile ≥ 90 em performance e acessibilidade; formulário funciona sem JS habilitado (progressive enhancement do server action)
- [ ] Commit: `feat(landing): página principal com formulário de pré-cadastro`

### ✅ Tarefa 8: Página do voucher

**Arquivos:** `src/app/voucher/[code]/page.tsx`, `src/components/VoucherCard.tsx`

- [ ] Busca voucher + lead por `code`; 404 se não existir
- [ ] Exibe: código em destaque, "10% de desconto", nome do cliente, "válido até DD/MM/AAAA às HH:mm" em `America/Sao_Paulo`, QR code (conteúdo = URL `/balcao?code=VIP-XXXXXX`), estado (ativo / expirado / já utilizado em DD/MM na unidade X) com cores distintas
- [ ] Botões: "Salvar no WhatsApp" (`https://wa.me/?text=` com código e validade), "Agendar agora" (link para o WhatsApp da barbearia ou sistema de agendamento), "Adicionar ao calendário" (`.ics` com lembrete 1 dia antes de expirar; opcional)
- [ ] `robots: noindex`; não há dados sensíveis além de primeiro nome
- [ ] Verificar: criar lead pelo formulário e ser redirecionado; abrir o QR com o celular
- [ ] `/meu-voucher`: formulário com WhatsApp + data de nascimento; se baterem com um lead, redireciona para `/voucher/[code]`; se o lead estiver `UNKNOWN`, mostra "ainda estamos confirmando, volte em alguns minutos"; se `DENIED`, manda para `/ja-cliente`. Rate limit 10/h por IP; resposta idêntica para "não encontrado" e "nascimento errado" (não vazar quem está cadastrado)
- [ ] Commit: `feat(voucher): página do voucher com QR, compartilhamento e recuperação`

### ✅ Tarefa 9: Validador e queima do voucher por unidade (TDD)

**Arquivos:** `src/app/api/vouchers/[code]/route.ts`, `src/app/api/vouchers/[code]/burn/route.ts`, `src/lib/unit-auth.ts`, `src/lib/voucher.ts` (função `burnVoucher`), `src/app/balcao/page.tsx`, `tests/unit/burn-voucher.test.ts`

**Validador: `GET /api/vouchers/[code]`** (público, só leitura, nunca altera estado)
- [ ] Resposta: `{ code, state: 'ACTIVE'|'EXPIRED'|'USED'|'CANCELLED', discountPercent, issuedAt, expiresAt, customerFirstName, usedAt?, usedUnit?: { slug, name } }`
- [ ] 404 se o código não existir; código normalizado para maiúsculas e sem espaços antes da busca
- [ ] Rate limit por IP (60/min) para impedir enumeração de códigos
- [ ] Registra `VoucherAudit { action: VALIDATED }` (sem unidade, pois é público)

**Queima: `POST /api/vouchers/[code]/burn`**
- [ ] Body: `{ unit: string, pin: string, operator?: string }`. `verifyUnitPin(unit, pin)` valida o PIN contra a unidade informada (ativa); PIN inválido → 401 + `VoucherAudit { action: REJECTED, reason: 'BAD_PIN', unitId }` (sem revelar se o código existe)
- [ ] Bloqueio por força bruta: 5 PINs errados para a mesma unidade em 15 min → 429 por 15 min para aquela unidade + IP; cada bloqueio gera audit `REJECTED/LOCKED` e aparece no painel
- [ ] `burnVoucher(code, unitId, operator)` em `src/lib/voucher.ts`, **atômico**:
  ```ts
  const { count } = await prisma.voucher.updateMany({
    where: { code, status: 'ACTIVE', expiresAt: { gt: now } },
    data:  { status: 'USED', usedAt: now, usedUnitId: unitId, usedBy: operator },
  });
  ```
  `count === 1` → sucesso. `count === 0` → reler o voucher para descobrir o motivo (`EXPIRED`, `ALREADY_USED`, `CANCELLED`, `NOT_FOUND`) e devolver 409 (ou 404) com `{ reason, usedAt, usedUnit }` para o barbeiro ver onde e quando já foi usado
- [ ] Sempre grava `VoucherAudit` com `unitId`: `BURNED` no sucesso, `REJECTED` + `reason` na falha
- [ ] Resposta de sucesso: `{ ok: true, code, discountPercent, usedAt, unit: { slug, name }, customerFirstName }`
- [ ] Idempotência: o mesmo código queimado duas vezes pela mesma unidade devolve 409 `ALREADY_USED` (não 200), para o barbeiro perceber que o desconto já foi dado

**Testes (`burn-voucher.test.ts`)**
1. voucher ativo + PIN da unidade A → `USED`, `usedAt ≈ now`, `usedUnitId = A`, audit `BURNED`
2. queimar de novo (unidade A ou B) → 409 `ALREADY_USED` com `usedUnit = A`; estado no banco não muda
3. voucher expirado → 409 `EXPIRED`, continua `ACTIVE` no banco (não vira USED)
4. PIN errado → 401, voucher intacto, audit `REJECTED/BAD_PIN`
5. unidade inativa → 401
6. código inexistente com PIN válido → 404
7. concorrência: duas chamadas `burn` simultâneas (`Promise.all`) → exatamente uma com 200 e uma com 409
8. `GET` do validador nunca altera `status`
9. 5 PINs errados seguidos na unidade A → 6ª tentativa com PIN correto recebe 429; unidade B continua funcionando

**Tela `/balcao`** (uso no celular do barbeiro)
- [ ] Passo 1: seleção da unidade (lista com busca das 29, ou já definida pelo link `/balcao/<slug>` que cada recepção salva na tela inicial do celular/tablet) e campo de PIN; ao validar, guarda unidade + PIN em `sessionStorage` e mostra o nome da unidade fixo no topo ("Você está em: Barbearia VIP Centro") com botão "trocar unidade"
- [ ] Rota `/balcao/[slug]` pré-seleciona a unidade e esconde a lista; é o link que vai no material de treinamento de cada recepção
- [ ] Passo 2: campo de código com autofocus, aceita `?code=` vindo do QR do voucher; botão "Validar" chama o `GET` e mostra cartão com nome do cliente, desconto, validade e estado em cor (verde ativo, cinza usado com data e unidade, vermelho expirado)
- [ ] Passo 3: botão grande "Aplicar desconto e queimar voucher" aparece **só** se o estado for `ACTIVE`; pede confirmação; chama o `POST /burn`; mostra confirmação com data/hora e unidade. Campo opcional "seu nome" vira `operator`
- [ ] Em erro 409, mostra o motivo em linguagem clara ("Este voucher já foi usado em 21/10 às 15:32 na unidade Shopping")
- [ ] Commit: `feat(balcao): validador de voucher e queima atômica com data e unidade`

### ✅ Tarefa 10: Painel de atribuição por influencer

**Arquivos:** `src/app/admin/page.tsx`, `src/app/api/admin/export/route.ts`

- [ ] Proteção: `?token=` ou cookie comparado com `ADMIN_TOKEN` (suficiente para uso interno; trocar por auth real se virar produto)
- [ ] Tabela por influencer: cliques, leads, **elegíveis / já clientes (negados) / pendentes de verificação**, taxa clique→lead, vouchers ativos, usados, expirados, taxa lead→uso, último lead. Filtro por período. A coluna "já clientes" mostra quanto do tráfego de cada influencer era base existente, o que importa para a remuneração
- [ ] Alerta no topo quando houver leads `UNKNOWN` há mais de 1 h (API fora ou mudou), com contagem e botão "re-verificar agora"
- [ ] Alerta de leads com `syncStatus FAILED` por erro de validação, para correção manual
- [ ] Tabela por unidade (29 linhas): vouchers queimados no período, por dia, e de quais influencers vieram (cruzamento influencer × unidade). Ordenável por coluna e com busca por nome, para achar uma filial rápido
- [ ] Indicador por unidade de "última queima" e "unidades sem nenhuma queima no período", para identificar recepções que não estão aplicando a campanha
- [ ] Linha "Sem atribuição" para leads com `influencerId = null` (tráfego direto)
- [ ] Lista de tentativas rejeitadas (`VoucherAudit.REJECTED`) agrupadas por motivo e unidade, para detectar fraude ou PIN vazado
- [ ] Ação "Cancelar voucher" (status `CANCELLED`) para casos de abuso
- [ ] Export CSV de leads (nome, telefone, influencer, data do cadastro, código, status, `usedAt`, unidade) para a barbearia usar
- [ ] Verificar: números batem com consultas diretas no Prisma Studio
- [ ] Commit: `feat(admin): painel por influencer e por unidade, auditoria e export CSV`

### ✅ Tarefa 11: Reprocessamento de sincronização com a API

**Arquivos:** `src/app/api/cron/sync-leads/route.ts`, `vercel.json`

- [ ] Rota protegida por `Authorization: Bearer ${CRON_SECRET}`
- [ ] Passo A, elegibilidade: busca até 50 leads `eligibility = UNKNOWN` com `eligibilityAttempts < 12` (3 h a cada 15 min), roda `checkEligibility`; elegível → emite voucher (mesma transação da Tarefa 6) e segue para o cadastro; negado → `DENIED`. A pessoa recupera o voucher em `/meu-voucher`
- [ ] Passo B, cadastro: busca até 50 leads `PENDING`/`FAILED` com `syncAttempts < 5` (ignora `DUPLICATE`, `SYNCED`, `SYNCED_EXISTING` e leads sem voucher), chama `criarCliente`, atualiza status e contador; `DUPLICATE` na repetição também encerra
- [ ] `vercel.json`: cron a cada 15 min
- [ ] Teste: lead `FAILED` vira `SYNCED` quando o mock passa a responder
- [ ] Commit: `feat(sync): cron de reprocessamento de leads pendentes`

### Tarefa 12: Analytics de marketing (opcional, mas recomendado)

**Arquivos:** `src/components/Analytics.tsx`, `src/lib/events.ts`

- [ ] GA4 e/ou Meta Pixel via variáveis de ambiente, carregados com `next/script` `afterInteractive`
- [ ] Eventos: `view_landing` (com `ref`), `form_start`, `lead` (gerar `Lead` no Pixel para otimização de anúncios), `voucher_view`
- [ ] Respeitar consentimento: carregar só após aceite do banner de cookies, ou usar modo de consentimento do GA4
- [ ] Commit: `feat(analytics): eventos GA4/Meta com atribuição por influencer`

### ✅ Tarefa 13: E2E, deploy e checklist de lançamento

**Arquivos:** `tests/e2e/fluxo-completo.spec.ts`, `README.md`

- [ ] Playwright, cliente novo: acessar `/i/joaobarber` → etapa 1 com telefone "novo" → etapa 2 → página do voucher com código válido → `GET /api/vouchers/[code]` devolve `ACTIVE` e influencer correto → tentar cadastrar o mesmo telefone mostra o mesmo código → em `/balcao`, PIN da unidade `centro`, validar o código, queimar → página do voucher passa a mostrar "usado em ... na unidade Centro" → segunda queima mostra erro de já utilizado
- [ ] Playwright, já cliente: etapa 1 com telefone terminando em `2222` (mock: tem consumo) → cai em `/ja-cliente`, nenhum voucher criado no banco
- [ ] Playwright, cadastro sem consumo: telefone `1111` → voucher emitido, lead com `externalId 901` e `SYNCED_EXISTING`, nenhum `POST /clientes/novo` disparado
- [ ] Playwright, API fora: telefone `9999` → mensagem de tentar de novo, lead `UNKNOWN`, nenhum voucher; `/meu-voucher` informa que ainda está confirmando
- [ ] Deploy na Vercel com Neon; rodar `prisma migrate deploy` no build
- [ ] README: como criar um influencer e gerar o link (`npm run influencer:add -- --slug joaobarber --name "João" --handle @joaobarber`), como trocar `BARBEARIA_VIP_CLIENT` para `http`, como usar o balcão
- [ ] Checklist: domínio + HTTPS, OG image testada no WhatsApp, Turnstile em produção, as 29 unidades importadas com PINs distintos e o arquivo de PINs apagado após entrega, link `/balcao/<slug>` salvo em cada recepção, tokens fortes, política de privacidade revisada, teste real de ponta a ponta no celular
- [ ] Commit: `test(e2e): fluxo completo + docs de operação`

### Tarefa 14: Ativar a API real em produção

**Arquivos:** `src/lib/barbearia-vip/http-client.ts`, `.env` de produção

- [ ] Confirmar com a Barbearia VIP: mensagem exata de email duplicado, códigos HTTP usados, existência de ambiente de homologação (ver perguntas em aberto)
- [ ] Quando a autenticação da API for lançada: receber a credencial, definir `BARBEARIA_VIP_AUTH_SCHEME` e `BARBEARIA_VIP_API_KEY` em produção, rodar o teste de fumaça e conferir que o cron não acumulou leads `UNKNOWN`/`FAILED` por 401
- [ ] Ajustar a classificação de `DUPLICATE` para a mensagem real e adicionar o caso ao teste
- [ ] Cadastro de teste combinado com eles (email e telefone de teste) e depois exclusão do cliente de teste no app
- [ ] Trocar `BARBEARIA_VIP_CLIENT=http` em produção, rodar o cron uma vez para sincronizar o backlog, conferir no painel que os leads viram `SYNCED` com `externalId`
- [ ] Commit: `chore(integration): ativa cliente HTTP da API Barbearia VIP`

---

## 6.1 Conteúdo e placeholders

Enquanto o material real não chega, a landing é construída sobre `docs/templates/conteudo.md` (textos) e `assets/placeholders/` (imagens SVG neutras). Regras:

- Todo texto da landing vem de um único arquivo `src/content/site.ts`, preenchido a partir de `conteudo.md`. Trocar um texto não exige mexer em componente
- Toda imagem é referenciada por nome fixo (`logo`, `hero`, `og-image`, `unidade-<slug>`); o build usa o arquivo real em `public/images/` se existir, senão o placeholder correspondente. Assim o site fica publicável desde o primeiro deploy
- Itens marcados `[PENDENTE]` em `conteudo.md` aparecem no painel admin como checklist de conteúdo, para o time ver o que falta
- A política de privacidade placeholder deixa explícito no rodapé "versão provisória", para não ir ao ar como se fosse definitiva

---

## 7. Critérios de aceite

- [ ] Um link `/i/<slug>` por influencer; leads e vouchers originados por ele aparecem atribuídos no painel
- [ ] Pré-cadastro grava o lead localmente e cria o cliente em `POST /api/clientes/novo` com os 6 campos obrigatórios (ou agenda a repetição se a API estiver fora)
- [ ] Nenhum voucher é emitido para telefone que tenha cliente com venda registrada na Barbearia VIP; a verificação final acontece no servidor, na submissão
- [ ] Sem resposta da API de consulta, nenhum voucher é emitido; o lead fica pendente, é re-verificado automaticamente e a pessoa recupera o voucher depois
- [ ] Cliente já cadastrado sem consumo recebe voucher sem gerar cadastro duplicado
- [ ] Voucher de 10% com validade de exatamente 7 dias a partir da emissão, código único, um por telefone
- [ ] Barbeiro consegue **validar** o voucher (sem alterar nada) e **queimar** com o PIN da sua unidade; a queima grava data/hora e unidade e é irreversível
- [ ] Um voucher nunca é queimado duas vezes, mesmo com tentativas simultâneas em unidades diferentes
- [ ] O painel mostra, por influencer e por unidade, quantos vouchers foram usados e quando
- [ ] Formulário funciona em celular 3G, com Turnstile, sem permitir cadastro sem consentimento LGPD
- [ ] Testes unitários e E2E verdes; deploy em produção com HTTPS

---

## 8. Perguntas em aberto (não bloqueiam o início)

1. ~~**API da Barbearia VIP**~~ **Parcialmente resolvido:** endpoint e campos recebidos (seção 5). Ainda falta:
   - ~~**Autenticação**~~ **Resolvido:** a API é aberta hoje e um mecanismo está em criação. O cliente HTTP já está preparado (`authHeaders()`); precisamos ser avisados antes de entrar no ar para não ficarmos com 401 em produção.
   - **Mensagem de duplicidade**: qual o texto exato de `mensagem` quando o email já existe? E telefone duplicado é aceito ou recusado?
   - **Códigos HTTP**: erro de validação vem como 200 com `sucesso: false` ou como 400/422?
   - **Homologação**: existe ambiente de testes ou só produção?
   - **Origem**: há interesse em um campo `origem`/`indicacao` na API para o app deles saber que o cliente veio de influencer? Hoje isso fica só no nosso banco.
   - A API não tem conceito de voucher, então o resgate fica só pelo nosso `/balcao` (confirmado pelo plano).
2. **Regra de validade**: 7 × 24h a partir do cadastro (padrão do plano) ou até o fim do 7º dia?
3. **Serviços elegíveis**: 10% em qualquer serviço ou só no corte? Combinável com outras promoções? Isso vai no texto da landing e do voucher
4. **Atribuição**: first-touch (padrão do plano) ou last-touch? Afeta como influencers são pagos
5. **Notificação**: enviar o voucher também por WhatsApp (API oficial ou Z-API/Twilio tem custo e exige template aprovado) ou basta a página + botão de compartilhar?
6. **Conteúdo**: logo, fotos, endereço, horários, Instagram, CNPJ e texto da política de privacidade. Template em `docs/templates/conteudo.md`; placeholders em `assets/placeholders/` são usados pela landing até o material real chegar (seção "Conteúdo e placeholders" abaixo)
7. **Domínio e hospedagem**: já existe domínio da Barbearia VIP para usar um subdomínio (ex. `promo.barbeariavip.com.br`)?
8. ~~**Unidades**~~ **Dados recebidos em 22/10** em `docs/data/unidades.csv` e `.xlsx`: **31 linhas**, não 29. Pendências em `docs/data/README.md`: a `SC 401 - ANTIGA` (id 33) parece desativada; 4 unidades sem telefone; 9 sem CEP; 2 telefones de MG parecem celulares sem o 9º dígito; nenhuma com Instagram ou link do Maps. Confirmar quais das 31 participam
9. **Consultas de elegibilidade** (parcialmente resolvido em 22/10):
   - ~~telefone com ou sem 55 / `versao`~~ **Resolvido:** sem o `55`, sem `versao`
   - ~~o que conta como venda~~ **Resolvido:** qualquer item em `historico` desqualifica; `pontuacoes` não entra
   - ~~autenticação~~ **Resolvido:** aberta hoje, em desenvolvimento
   - ~~cancelamentos e faltas~~ **Resolvido:** `historico` não inclui cancelamentos nem no-show; qualquer item é consumo real
   - ~~busca exata ou por sufixo~~ **Resolvido:** busca exata por telefone
   - ~~aviso da autenticação~~ **Resolvido:** a Barbearia VIP avisa antes de produção exigir autenticação
   - Ainda em aberto: latência típica das consultas, já que a etapa 1 espera até 2 chamadas em sequência (medir no teste de fumaça)
10. **Nascimento e email obrigatórios**: a API exige os dois. Está ok pedir na landing? A alternativa seria a Barbearia VIP relaxar a obrigatoriedade na API, o que simplificaria o formulário para 3 campos e tende a converter mais
