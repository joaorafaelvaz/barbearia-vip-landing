/**
 * E2E contra `npm run dev` com o banco de dev semeado (`npm run db:seed`):
 * influencer `joaobarber`, unidade `florianopolis-centro`, PIN 123456, API em modo mock.
 */
import { expect, test, type Page } from "@playwright/test";

const UNIT = "florianopolis-centro";
const PIN = "123456";
const rand4 = () => String(Math.floor(1000 + Math.random() * 8999));

async function step1(page: Page, name: string, phone: string) {
  await page.fill("input[name=name]", name);
  await page.fill("input[name=phone]", phone);
  await page.selectOption("select[name=unitSlug]", UNIT);
  await page.getByRole("button", { name: /continuar/i }).click();
}

async function step2(page: Page, email: string) {
  await page.waitForSelector("input[name=email]:visible");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=birthDate]", "05/05/1995");
  await page.check("input[name=consent]");
  await page.getByRole("button", { name: /gerar meu voucher/i }).click();
}

test("cliente novo: link do influencer → cadastro → voucher → queima no balcão", async ({ page, request }) => {
  const suffix = rand4();
  const phone = `(48) 99999-${suffix}`;

  await page.goto("/i/joaobarber");
  await expect(page).toHaveURL(/\?ref=joaobarber&utm_source=joaobarber&utm_medium=influencer/);
  await expect(page.getByText(/indicação de @joaobarber/i)).toBeVisible();

  await step1(page, "Carlos Teste", phone);
  await step2(page, `carlos.${suffix}.${Date.now()}@example.com`);
  await expect(page).toHaveURL(/\/voucher\/VIP-/);
  const code = (await page.getByTestId("voucher-code").innerText()).trim();
  expect(code).toMatch(/^VIP-[A-HJ-NP-Z2-9]{6}$/);
  await expect(page.getByTestId("voucher-state")).toHaveText(/ativo/i);

  // validador público
  const lookup = await request.get(`/api/vouchers/${code}`);
  expect(lookup.status()).toBe(200);
  expect(await lookup.json()).toMatchObject({ code, state: "ACTIVE", discountPercent: 10, customerFirstName: "Carlos" });

  // mesmo telefone de novo → mesmo código, sem novo voucher
  await page.goto("/");
  await step1(page, "Carlos Teste", phone);
  await step2(page, `outro.${suffix}@example.com`);
  await expect(page).toHaveURL(new RegExp(`/voucher/${code}$`));

  // balcão: PIN da unidade, validar, queimar
  page.on("dialog", (d) => d.accept());
  await page.goto(`/balcao/${UNIT}?code=${code}`);
  await page.fill("input[inputmode=numeric], input[type=password]", PIN);
  await page.getByRole("button", { name: /entrar|confirmar|validar pin|continuar/i }).first().click();
  await expect(page.getByText(/^ativo$/i).first()).toBeVisible();
  await page.getByRole("button", { name: /queimar/i }).click();
  await expect(page.getByText(/desconto aplicado/i)).toBeVisible();

  // página do voucher passa a mostrar usado; segunda queima é recusada
  await page.goto(`/voucher/${code}`);
  await expect(page.getByTestId("voucher-state")).toHaveText(/utilizado/i);
  await expect(page.getByText(/florianópolis - centro/i).first()).toBeVisible();
  const again = await request.post(`/api/vouchers/${code}/burn`, { data: { unit: UNIT, pin: PIN } });
  expect(again.status()).toBe(409);
  expect(await again.json()).toMatchObject({ ok: false, reason: "ALREADY_USED" });
});

test("já cliente com consumo é negado na etapa 1", async ({ page }) => {
  await page.goto("/");
  await step1(page, "Bia Teste", "(48) 99999-2222");
  await expect(page).toHaveURL(/\/ja-cliente/);
  await expect(page.getByRole("heading", { name: /já faz parte/i })).toBeVisible();
});

test("cadastro existente sem consumo recebe voucher", async ({ page }) => {
  await page.goto("/");
  await step1(page, "Dani Teste", "(48) 99999-1111");
  await step2(page, `dani.${Date.now()}@example.com`);
  await expect(page).toHaveURL(/\/voucher\/VIP-/);
  await expect(page.getByTestId("voucher-state")).toHaveText(/ativo/i);
});

test("API indisponível: sem voucher, mensagem para tentar de novo", async ({ page }) => {
  await page.goto("/");
  await step1(page, "Edu Teste", "(48) 99999-9999");
  await expect(page.getByText(/não conseguimos confirmar/i)).toBeVisible();
  await expect(page).toHaveURL(/\/($|\?)/);
});

test("recuperar voucher por WhatsApp + nascimento", async ({ page }) => {
  const suffix = rand4();
  await page.goto("/");
  await step1(page, "Fabi Teste", `(48) 99999-${suffix}`);
  await step2(page, `fabi.${suffix}@example.com`);
  await expect(page).toHaveURL(/\/voucher\/VIP-/);
  const code = (await page.getByTestId("voucher-code").innerText()).trim();

  await page.goto("/meu-voucher");
  await page.fill("#phone", `(48) 99999-${suffix}`);
  await page.fill("#birthDate", "05/05/1995");
  await page.getByRole("button", { name: /buscar voucher/i }).click();
  await expect(page).toHaveURL(new RegExp(`/voucher/${code}$`));

  await page.goto("/meu-voucher");
  await page.fill("#phone", `(48) 99999-${suffix}`);
  await page.fill("#birthDate", "06/05/1995");
  await page.getByRole("button", { name: /buscar voucher/i }).click();
  await expect(page.getByText(/não encontramos/i)).toBeVisible();
});
