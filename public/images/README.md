# Imagens da landing

A landing procura primeiro o arquivo real nesta pasta e só usa o placeholder de `placeholders/` se ele não existir (ver `src/lib/site-assets.ts`). Basta colocar o arquivo com o nome abaixo e fazer o deploy; nenhum código precisa mudar.

| Nome fixo | Coloque aqui | Especificação | Placeholder usado hoje |
|---|---|---|---|
| `logo` | `logo.svg` (ou `.png`) | fundo transparente, mín. 1200 px de largura | `placeholders/logo.svg` |
| `hero` | `hero.jpg` (ou `.webp`/`.png`) | 1920×1080, horizontal, sem texto | `placeholders/hero.svg` |
| `og-image` | `og-image.png` (ou `.jpg`) | 1200×630, logo + "10% OFF no primeiro corte" | `placeholders/og-image.svg` |
| `unidade` | `unidades/<slug>.jpg` | 4:3, mín. 1200 px, uma por unidade | `placeholders/unidade.svg` |

Extensões aceitas, nesta ordem de preferência: `svg`, `png`, `jpg`, `jpeg`, `webp`.

Cores provisórias (fundo `#0B0B0C`, dourado `#C9A227`) ficam em `src/app/globals.css` (tokens `@theme`) e documentadas em `src/content/site.ts`.
