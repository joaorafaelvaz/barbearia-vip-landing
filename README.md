# Barbearia VIP — Landing da campanha com influencers

Landing page onde visitantes vindos de links de influencers fazem pré-cadastro no app da Barbearia VIP e, se nunca consumiram na rede, recebem um voucher de 10% válido por 7 dias em qualquer unidade participante.

## Estado atual

Fase de planejamento. O código ainda não foi iniciado.

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
