import { GlobalWorkerOptions, getDocument, PasswordResponses } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { TextItem as PdfTextItem } from "pdfjs-dist/types/src/display/api";
import type { TextItem } from "../../domain/import/lines";
import { PdfPasswordError } from "./read-pdf";

// O worker é um arquivo à parte, servido do próprio app (nunca de CDN): o
// pdf.js parseia fora da thread principal e a tela não congela numa fatura de
// 20 páginas.
GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Único módulo que conhece o pdf.js. Chega por `import()` dinâmico, então o
 * shell do app não paga nada por ele até a primeira importação.
 */
export async function readPdfText(file: Blob, password?: string): Promise<TextItem[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data, password });

  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (cause) {
    // PasswordException chega do worker só com `name` e `code`: `instanceof`
    // não sobrevive à serialização entre threads.
    const error = cause as { name?: string; code?: number };
    if (error.name === "PasswordException") {
      throw new PdfPasswordError(error.code === PasswordResponses.INCORRECT_PASSWORD);
    }
    throw cause;
  }

  try {
    const items: TextItem[] = [];
    for (let page = 1; page <= pdf.numPages; page += 1) {
      const content = await (await pdf.getPage(page)).getTextContent();
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const item = raw as PdfTextItem;
        items.push({
          str: item.str,
          x: Number(item.transform[4]),
          y: Number(item.transform[5]),
          width: item.width,
          page,
        });
      }
    }
    return items;
  } finally {
    await task.destroy();
  }
}
