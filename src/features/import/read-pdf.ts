import type { TextItem } from "../../domain/import/lines";

/**
 * Lê o texto posicionado de um PDF. Injetado no `App` (como `processFile`):
 * o happy-dom não roda o pdf.js, e a tela não pode importá-lo estaticamente
 * sem puxá-lo para o shell.
 */
export type ReadPdf = (file: Blob, password?: string) => Promise<TextItem[]>;

/**
 * Fica fora de `pdf-text.ts` de propósito: a tela precisa reconhecer o erro, e
 * importar a classe de lá traria o pdf.js inteiro para o bundle principal.
 */
export class PdfPasswordError extends Error {
  /** `true` quando uma senha foi enviada e estava errada. */
  readonly wrong: boolean;

  constructor(wrong: boolean) {
    super(wrong ? "Senha incorreta" : "PDF protegido por senha");
    this.name = "PdfPasswordError";
    this.wrong = wrong;
  }
}

/** Carrega o leitor sob demanda: o pdf.js só desce na primeira importação. */
export const readPdfLazy: ReadPdf = async (file, password) => {
  const { readPdfText } = await import("./pdf-text");
  return readPdfText(file, password);
};
