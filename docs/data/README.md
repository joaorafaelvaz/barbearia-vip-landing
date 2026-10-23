# Unidades: dados recebidos em 22/10/2026

Total de linhas recebidas: **31** (o briefing falava em 29).

Fonte: export do sistema da Barbearia VIP. Convertido para `unidades.csv`/`unidades.xlsx` neste diretório. Transformações aplicadas:
- `slug` gerado de cidade + bairro, sem acentos (vira o link `/balcao/<slug>`)
- `nome` exibido = `Cidade - Bairro` (removido o prefixo `Brasil - UF -`)
- `telefone` normalizado para dígitos com DDD, sem o 55; `tipo_telefone` indica fixo ou celular (só celular serve para link de WhatsApp)
- `cep` igual a 0 virou vazio
- colunas `localizacao` e `link_maps` vieram todas NULL; `link_maps` mantida vazia para preenchimento

## Pendências por unidade

| unidade_id | pendência |
|---|---|
| 5 | CEP ausente (veio 0) |
| 13 | CEP ausente (veio 0) |
| 20 | CEP ausente (veio 0) |
| 25 | cidade 'Florianopolis' sem acento; corrigida para 'Florianópolis' |
| 32 | CEP ausente (veio 0) |
| 33 | ~~unidade desativada?~~ **Confirmado em 23/10: desativada.** Coluna `ativo = nao` no CSV |
| 47 | CEP ausente (veio 0) |
| 48 | CEP ausente (veio 0) |
| 51 | CEP ausente (veio 0) |
| 51 | telefone ausente |
| 52 | CEP ausente (veio 0) |
| 52 | telefone ausente |
| 60 | telefone ausente |
| 63 | telefone ausente |
| 57 | telefone 32 9989-9907 parece celular sem o 9º dígito; confirmar |
| 54 | telefone 32 8837-8755 parece celular sem o 9º dígito; confirmar |

## Resumo

- Unidades sem telefone: 4
- Unidades com telefone fixo (não serve para botão de WhatsApp): 22
- Unidades com telefone que parece celular antigo de 8 dígitos: 2 (ids 54 e 57)
- Unidades com celular: 3
- Unidades sem CEP: 8
- Nenhuma unidade com Instagram próprio ou link do Maps informado

## Perguntas

1. ~~São 31 linhas e o briefing dizia 29.~~ **Resolvido:** a `SC 401 - ANTIGA` (id 33) está desativada; 30 unidades participam.
2. (telefones faltantes e destino do "Agendar agora" serão informados pelo cliente) O botão "Agendar agora" da página do voucher deve apontar para o WhatsApp da unidade? A maioria dos números é fixo. Alternativas: um WhatsApp central, o link de agendamento do app, ou só exibir o telefone.
3. Nome da unidade exibido ao cliente: `Florianópolis - Centro` (padrão adotado) ou outro formato?
