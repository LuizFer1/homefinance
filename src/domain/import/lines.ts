import { hasAmount, startsWithDate } from "./parse";

/**
 * Um pedaço de texto posicionado, como o pdf.js entrega. Coordenadas em pontos
 * PDF: `y` cresce para **cima**, então a primeira linha da página é a de maior `y`.
 */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  page: number;
}

/**
 * Tolerância vertical, em pontos. Colunas da mesma linha da fatura saem com
 * `y` levemente diferente (fonte, baseline de negrito); 3pt fica abaixo da
 * entrelinha de qualquer fatura (~10pt) e acima dessa oscilação.
 */
const SAME_LINE_PT = 3;

/**
 * Espaço horizontal a partir do qual dois pedaços viram duas palavras. Menos
 * que isso é o mesmo token partido pelo gerador do PDF ("1.2" + "34,56"), e um
 * espaço no meio quebraria o valor.
 */
const WORD_GAP_PT = 1;

/**
 * Distância vertical máxima, em pontos, entre a linha da data e um pedaço da
 * descrição que quebrou. Extratos como o do Mercado Pago centralizam a data na
 * célula e quebram a descrição em até três linhas, ±13pt dela; lançamentos
 * vizinhos ficam a 30pt ou mais.
 */
const WRAP_PT = 15;

function joinItems(items: readonly TextItem[]): string {
  let text = "";
  let end = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (text !== "" && item.x - end > WORD_GAP_PT) text += " ";
    text += item.str;
    end = item.x + item.width;
  }
  return text.replace(/\s+/g, " ").trim();
}

interface Row {
  items: TextItem[];
  page: number;
  y: number;
  text: string;
  /** Linha com data e valor: um lançamento. */
  anchor: boolean;
  /** Início horizontal do primeiro valor, se for âncora. */
  amountX: number;
  above: string[];
  below: string[];
  /** Absorvida por uma âncora; some da saída. */
  merged: boolean;
}

/**
 * Remonta as linhas visuais da página a partir dos pedaços soltos.
 *
 * O pdf.js devolve os pedaços na ordem em que o PDF os desenha, que não é a de
 * leitura: faturas desenham coluna por coluna. Agrupar por `y` e ordenar por
 * `x` é o que devolve "data · descrição · valor" numa string só.
 *
 * Quando a descrição quebra em várias linhas, as de cima e de baixo voltam para
 * a linha da data — sem isso o nome do lançamento fica numa linha que o parser
 * descarta, e na revisão só sobra o que estava ao lado da data.
 */
export function groupLines(items: readonly TextItem[]): string[] {
  const rows = buildRows(items);
  const anchors = rows.filter((row) => row.anchor);

  for (const row of rows) {
    if (row.anchor || startsWithDate(row.text) || hasAmount(row.text)) continue;
    let best: Row | null = null;
    for (const anchor of anchors) {
      if (anchor.page !== row.page) continue;
      const distance = Math.abs(anchor.y - row.y);
      if (distance > WRAP_PT) continue;
      if (best === null || distance < Math.abs(best.y - row.y)) best = anchor;
    }
    if (best === null || !insideDescription(row, best)) continue;
    (row.y > best.y ? best.above : best.below).push(row.text);
    row.merged = true;
  }

  return rows.filter((row) => !row.merged).map(render);
}

/**
 * O pedaço tem de estar entre o começo da data e o valor da âncora. Um
 * cabeçalho ("Data Descrição") começa na coluna da data e um total traz valor:
 * nenhum dos dois é continuação.
 */
function insideDescription(row: Row, anchor: Row): boolean {
  const dateX = anchor.items[0]?.x ?? 0;
  return row.items.every(
    (item) => item.x > dateX + WORD_GAP_PT && item.x + item.width <= anchor.amountX,
  );
}

function render(row: Row): string {
  if (row.above.length === 0 && row.below.length === 0) return row.text;
  const [date, ...rest] = row.items;
  const middle = rest.filter((item) => item.x < row.amountX);
  const amounts = rest.filter((item) => item.x >= row.amountX);
  return [date?.str ?? "", ...row.above, joinItems(middle), ...row.below, joinItems(amounts)]
    .filter((part) => part !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRows(items: readonly TextItem[]): Row[] {
  const sorted = items
    .filter((item) => item.str.trim() !== "")
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    const head = row?.[0];
    if (row !== undefined && head !== undefined && head.page === item.page) {
      if (Math.abs(head.y - item.y) <= SAME_LINE_PT) {
        row.push(item);
        continue;
      }
    }
    rows.push([item]);
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const text = joinItems(row);
    // "R$" às vezes sai num pedaço à parte, antes do número.
    const amount = row.find(
      (item, index) => index > 0 && (hasAmount(item.str) || item.str.trim() === "R$"),
    );
    const head = row[0] as TextItem;
    return {
      items: row,
      page: head.page,
      y: head.y,
      text,
      anchor: amount !== undefined && startsWithDate(text) && hasAmount(text),
      amountX: amount?.x ?? Number.POSITIVE_INFINITY,
      above: [],
      below: [],
      merged: false,
    };
  });
}
