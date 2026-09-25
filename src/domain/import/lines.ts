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
 * Remonta as linhas visuais da página a partir dos pedaços soltos.
 *
 * O pdf.js devolve os pedaços na ordem em que o PDF os desenha, que não é a de
 * leitura: faturas desenham coluna por coluna. Agrupar por `y` e ordenar por
 * `x` é o que devolve "data · descrição · valor" numa string só.
 */
export function groupLines(items: readonly TextItem[]): string[] {
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
    let text = "";
    let end = Number.NEGATIVE_INFINITY;
    for (const item of row) {
      if (text !== "" && item.x - end > WORD_GAP_PT) text += " ";
      text += item.str;
      end = item.x + item.width;
    }
    return text.replace(/\s+/g, " ").trim();
  });
}
