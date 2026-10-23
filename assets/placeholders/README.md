# Placeholders

Imagens SVG neutras usadas pela landing enquanto o material real não chega. A landing procura primeiro o arquivo real em `public/images/` e só usa estes se ele não existir.

| Placeholder | Substituir por | Especificação |
|---|---|---|
| `logo.svg` | `public/images/logo.svg` | SVG ou PNG transparente, mín. 1200 px de largura |
| `hero.svg` | `public/images/hero.jpg` | 1920×1080, sem texto |
| `og-image.svg` | `public/images/og-image.png` | 1200×630 (preview no WhatsApp/Instagram) |
| `unidade.svg` | `public/images/unidades/<slug>.jpg` | 4:3, mín. 1200 px |

Cores provisórias: fundo `#0B0B0C`, dourado `#D9B437`. Ajustar em `src/content/site.ts` quando a identidade visual chegar.
