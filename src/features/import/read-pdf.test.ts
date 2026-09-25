import { describe, expect, it, vi } from "vitest";
import { createReadPdf, PdfPasswordError, PdfReaderUnavailableError } from "./read-pdf";

const file = new Blob(["%PDF"]);

describe("createReadPdf", () => {
  it("offline, o leitor não baixado não é versão velha", async () => {
    const onStale = vi.fn();
    const readPdf = createReadPdf({
      load: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
      isOnline: () => false,
      onStale,
    });

    const error = await readPdf(file).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PdfReaderUnavailableError);
    expect((error as PdfReaderUnavailableError).offline).toBe(true);
    expect(onStale).not.toHaveBeenCalled();
  });

  it("online, a falha do import é versão velha e dispara a busca pela nova", async () => {
    const onStale = vi.fn();
    const readPdf = createReadPdf({
      load: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
      isOnline: () => true,
      onStale,
    });

    const error = await readPdf(file).catch((cause: unknown) => cause);
    expect((error as PdfReaderUnavailableError).offline).toBe(false);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("erro de leitura depois de carregado passa intacto", async () => {
    // Senha não é problema de versão: a tela precisa do erro original.
    const onStale = vi.fn();
    const readPdf = createReadPdf({
      load: async () => ({ readPdfText: () => Promise.reject(new PdfPasswordError(false)) }),
      isOnline: () => true,
      onStale,
    });

    await expect(readPdf(file)).rejects.toBeInstanceOf(PdfPasswordError);
    expect(onStale).not.toHaveBeenCalled();
  });
});
