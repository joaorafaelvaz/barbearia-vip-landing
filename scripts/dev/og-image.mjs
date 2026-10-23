/**
 * Gera public/images/og-image.png (1200×630) a partir do logo real, para o preview no WhatsApp/Instagram.
 *   CHROME_PATH=/caminho/chrome node scripts/dev/og-image.mjs   (sem CHROME_PATH usa o Chromium do Playwright)
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const logo = readFileSync(resolve(root, "public/images/logo.png")).toString("base64");
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px;background:#0b0b0c;overflow:hidden}
  .wrap{position:relative;width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;
        background:radial-gradient(900px 500px at 50% 0%,rgba(217,180,55,.14),transparent 70%),#0b0b0c}
  .frame{position:absolute;inset:28px;border:3px solid #d9b437;border-radius:24px}
  img{width:520px;height:auto}
  h1{margin:0;font:400 128px/1 'Bebas Neue',Impact,sans-serif;color:#d9b437;letter-spacing:4px}
  p{margin:0;font:600 34px/1.3 Inter,Arial,sans-serif;color:#f5f5f4;text-align:center}
  small{font:400 24px Inter,Arial,sans-serif;color:#a3a3a3}
</style></head><body><div class="wrap"><div class="frame"></div>
<img src="data:image/png;base64,${logo}" alt="">
<h1>10% OFF</h1>
<p>no seu primeiro corte<br><small>válido por 7 dias · exclusivo para novos clientes</small></p>
</div></body></html>`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot({ type: "png" });
writeFileSync(resolve(root, "public/images/og-image.png"), png);
await browser.close();
console.log("public/images/og-image.png gerado");
