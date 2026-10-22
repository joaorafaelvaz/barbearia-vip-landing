import { readFile } from "node:fs/promises";
import path from "node:path";
import { Card, Pill } from "./Card";

const TEMPLATE_PATH = path.join(process.cwd(), "docs", "templates", "conteudo.md");

/**
 * Extrai os itens `[PENDENTE...]` do template (pode haver mais de um por linha).
 * Em tabelas, prefixa com o rótulo da linha (1ª célula); sem detalhe nem rótulo, usa a seção atual.
 */
export function extractPendingItems(markdown: string): string[] {
  const items: string[] = [];
  let section = "";
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.+)$/.exec(rawLine);
    if (heading) section = heading[1].trim();
    if (!rawLine.includes("[PENDENTE")) continue;
    // Pula a instrução do cabeçalho do template, que só explica a marcação.
    if (/^>\s/.test(rawLine) && /substituindo/i.test(rawLine)) continue;

    const isTableRow = rawLine.trim().startsWith("|");
    const cells = isTableRow ? rawLine.split("|").map((c) => c.trim()).filter(Boolean) : [];
    const label = cells.find((c) => !c.startsWith("[PENDENTE")) ?? "";

    const re = /\[PENDENTE(?::\s*([^\]]*))?\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawLine)) !== null) {
      const detail = m[1]?.trim() ?? "";
      if (detail && label && isTableRow && cells.indexOf(label) === 0) items.push(`${label}: ${detail}`);
      else if (detail) items.push(detail);
      else if (label && !cells[0]?.startsWith("[PENDENTE")) items.push(label);
      else items.push(section || "item sem descrição");
    }
  }
  return items;
}

export async function loadPendingItems(): Promise<string[] | null> {
  try {
    return extractPendingItems(await readFile(TEMPLATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

export async function PendingContent() {
  const items = await loadPendingItems();
  return (
    <Card
      title="Conteúdo pendente"
      description="Itens marcados [PENDENTE] em docs/templates/conteudo.md"
      actions={items ? <Pill tone={items.length > 0 ? "gold" : "success"}>{items.length}</Pill> : null}
    >
      {items === null ? (
        <p className="text-sm text-muted">Não foi possível ler docs/templates/conteudo.md.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-success">Nenhum item pendente.</p>
      ) : (
        <ul className="max-h-72 list-disc space-y-1 overflow-auto pl-5 text-sm">
          {items.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
