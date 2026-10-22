# Barbearia VIP — Landing da campanha com influencers

Landing page onde visitantes vindos de links de influencers fazem pré-cadastro no app da Barbearia VIP e, se nunca consumiram na rede, recebem um voucher de 10% válido por 7 dias em qualquer unidade participante.

## Estado atual

Em desenvolvimento. Núcleo implementado e testado: rastreio por influencer, elegibilidade via API, pré-cadastro com voucher, queima no balcão, painel, cron de reprocessamento. Veja o plano para o que falta.

## Rodando localmente

Requisitos: Node 22, Postgres 16 (local ou Docker).

```bash
cp .env.example .env            # ajuste DATABASE_URL e DATABASE_URL_TEST
npm install
npm run db:migrate              # aplica as migrations no banco de dev
npm run db:seed                 # 3 influencers + todas as unidades de docs/data/unidades.csv (PIN 123456)
npm run dev                     # http://localhost:3000
```

Postgres rápido com Docker:

```bash
docker run -d --name bvip-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:16
psql -h localhost -U postgres -c 'create database barbearia_vip_dev' -c 'create database barbearia_vip_test'
```

Comandos úteis:

| Comando | O que faz |
|---|---|
| `npm test` | Testes unitários e de integração (usa `DATABASE_URL_TEST`; aplica migrations sozinho) |
| `npm run test:e2e` | Playwright contra `npm run dev` |
| `npm run typecheck` / `npm run lint` | TypeScript e ESLint |
| `npm run unit:import -- docs/data/unidades.csv` | Importa/atualiza unidades; gera PIN por unidade nova e grava em `../unidades-pins-<data>.csv` (fora do repo; apague após entregar) |
| `npm run unit:rotate-pin -- --slug <slug>` | Troca o PIN de uma unidade |
| `npm run influencer:add -- --slug joaobarber --name "João" --handle @joaobarber --platform instagram` | Cadastra um influencer e imprime o link `/i/<slug>` |
| `npm run db:studio` | Prisma Studio |

### API da Barbearia VIP em desenvolvimento

Com `BARBEARIA_VIP_CLIENT=mock` (padrão) nenhuma chamada real é feita. O mock reage ao **sufixo do telefone**:

| Telefone termina em | `getCliente` | Resultado na landing |
|---|---|---|
| qualquer outro | não encontrado | elegível, cliente novo, `POST /clientes/novo` simulado |
| `1111` | cliente 901 sem consumo | elegível, reaproveita o id 901, sem POST |
| `2222` | cliente 902 com consumo | **negado** → `/ja-cliente` |
| `3333` | clientes 903 (sem) e 904 (com consumo) | negado |
| `9999` | API indisponível | "tente de novo"; lead pendente, cron re-verifica |
| `0000` | não encontrado, mas o POST falha | voucher emitido, cadastro fica `FAILED` e o cron repete |

E-mail terminando em `@dup.test` simula "e-mail já cadastrado" na API.

Para usar a API real: `BARBEARIA_VIP_CLIENT=http`. Quando a autenticação for lançada: `BARBEARIA_VIP_AUTH_SCHEME=bearer|api-key` e `BARBEARIA_VIP_API_KEY`.

### Rotas

| Rota | Uso |
|---|---|
| `/` | Landing (formulário em 2 etapas) |
| `/i/<slug>` | Link do influencer (clique + cookie + redirect) |
| `/voucher/<codigo>` | Página do voucher (QR, validade, estado) |
| `/meu-voucher` | Recuperar voucher por WhatsApp + nascimento |
| `/ja-cliente` | Negado: já é cliente com consumo |
| `/balcao` e `/balcao/<slug>` | Recepção: validar e queimar voucher com o PIN da unidade |
| `/admin` | Painel por influencer e por unidade, export CSV (token em `ADMIN_TOKEN`) |
| `GET /api/vouchers/<codigo>` | Validador público (só leitura) |
| `POST /api/vouchers/<codigo>/burn` | Queima (`{ unit, pin, operator? }`) |
| `GET /api/cron/sync-leads` | Reprocessamento (Bearer `CRON_SECRET`; cron da Vercel a cada 15 min) |

- **Plano de implementação:** [`docs/plans/2026-10-22-landing-barbearia-vip.md`](docs/plans/2026-10-22-landing-barbearia-vip.md). Arquitetura, modelo de dados, integração com a API, regras do voucher e 15 tarefas em ordem.
- **Unidades (dados reais):** [`docs/data/unidades.csv`](docs/data/unidades.csv) e `.xlsx`, 31 linhas convertidas do export do sistema. Pendências e perguntas em [`docs/data/README.md`](docs/data/README.md). Template de referência em `docs/templates/unidades.csv`.
- **Template de conteúdo:** [`docs/templates/conteudo.md`](docs/templates/conteudo.md). Textos, fotos, dados institucionais e política de privacidade, com `[PENDENTE]` no que falta.
- **Placeholders:** `assets/placeholders/`. Imagens provisórias para a landing ir ao ar antes do material definitivo.

## Regras de negócio resumidas

- Atribuição **first-touch** por cookie de 30 dias; link por influencer no formato `/i/<slug>`.
- Desconto **só para quem nunca consumiu**: consulta por telefone na API da Barbearia VIP; qualquer item no histórico nega.
- Voucher `VIP-XXXXXX`, 10%, validade de 7 × 24h, um por telefone, válido em qualquer unidade.
- Queima no balcão com o PIN da unidade (um por recepção), gravando data/hora e unidade. Irreversível e auditada.
- Sem resposta da API de consulta, nenhum voucher é emitido; o lead fica pendente e é re-verificado.

## Próximos passos

1. Resolver as pendências de `docs/data/README.md` (quais das 31 unidades participam, telefones faltantes).
2. Preencher o que for possível em `docs/templates/conteudo.md`.
3. Executar a Tarefa 1 do plano (scaffold do projeto).
