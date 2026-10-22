import fs from "node:fs";
import path from "node:path";

/**
 * Resolve imagens da landing por nome fixo.
 * Procura `public/images/<nome>.<ext>` (arquivo real enviado pelo cliente);
 * se não existir, devolve o placeholder em `public/images/placeholders/<nome>.svg`.
 *
 * Só roda no servidor (usa `fs`). O resultado é cacheado por processo: trocar
 * a imagem exige novo deploy/restart, o que é o fluxo esperado.
 */

export type SiteAssetName = "logo" | "hero" | "og-image" | "unidade";

const EXTENSIONS = ["svg", "png", "jpg", "jpeg", "webp"] as const;

const cache = new Map<SiteAssetName, string>();

export function getSiteAsset(name: SiteAssetName): string {
  const cached = cache.get(name);
  if (cached) return cached;

  const publicDir = path.join(process.cwd(), "public", "images");
  let resolved = `/images/placeholders/${name}.svg`;

  for (const ext of EXTENSIONS) {
    const candidate = path.join(publicDir, `${name}.${ext}`);
    if (fs.existsSync(candidate)) {
      resolved = `/images/${name}.${ext}`;
      break;
    }
  }

  cache.set(name, resolved);
  return resolved;
}

/** True quando o caminho resolvido ainda é um placeholder (útil para avisos no admin). */
export function isPlaceholderAsset(name: SiteAssetName): boolean {
  return getSiteAsset(name).startsWith("/images/placeholders/");
}

/** `next/image` não otimiza SVG; marque como `unoptimized` quando for o caso. */
export function isSvgAsset(src: string): boolean {
  return src.toLowerCase().endsWith(".svg");
}
