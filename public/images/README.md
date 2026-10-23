# Imagens da marca

| Arquivo | Origem | Uso |
|---|---|---|
| `logo.png` | `assets/brand/logo_horizontal_1920x1080.png` recortado ao conteúdo, fundo transparente | cabeçalho e rodapé (`getSiteAsset("logo")`) |
| `icon.png` | `assets/brand/icone_2000.png` em 512 px | ícone genérico |
| `../../src/app/icon.png`, `apple-icon.png` | idem | favicon e ícone iOS (convenção do App Router) |
| `og-image.png` | gerado por `scripts/dev/og-image.mjs` | preview no WhatsApp/Instagram (1200×630) |
| `placeholders/*.svg` | provisórios | usados só quando o arquivo real não existe |

Pendente: foto do hero (`hero.jpg`, 1920×1080) e fotos das unidades (`unidades/<slug>.jpg`).
Cor da marca: `#D9B437` (dourado). Fontes vetoriais em `assets/brand/` (`.eps`, `.ai`).
