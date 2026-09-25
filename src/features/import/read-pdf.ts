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

/**
 * O `import()` do leitor falhou. Offline na primeira vez, o pdf.js ainda não
 * foi baixado; online, a causa é outra: a aba roda uma versão que o servidor
 * já não tem, e o arquivo com o hash dela sumiu no último deploy.
 */
export class PdfReaderUnavailableError extends Error {
  readonly offline: boolean;

  constructor(offline: boolean, cause: unknown) {
    super(offline ? "Leitor de PDF não baixado" : "Leitor de PDF da versão anterior", { cause });
    this.name = "PdfReaderUnavailableError";
    this.offline = offline;
  }
}

export interface ReadPdfDeps {
  /** Injetado no teste; em produção é o `import()` que separa o pdf.js do shell. */
  load?: () => Promise<{ readPdfText: ReadPdf }>;
  isOnline: () => boolean;
  /** Chamado quando a versão aberta se mostrou velha — hora de buscar a nova. */
  onStale: () => void;
}

/** Carrega o leitor sob demanda: o pdf.js só desce na primeira importação. */
export function createReadPdf({
  load = () => import("./pdf-text"),
  isOnline,
  onStale,
}: ReadPdfDeps): ReadPdf {
  return async (file, password) => {
    let reader: { readPdfText: ReadPdf };
    try {
      reader = await load();
    } catch (cause) {
      const offline = !isOnline();
      if (!offline) onStale();
      throw new PdfReaderUnavailableError(offline, cause);
    }
    return reader.readPdfText(file, password);
  };
}
