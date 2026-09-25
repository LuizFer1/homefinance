import { describe, expect, it } from "vitest";
import { detectReferenceMonth, inferYear, parseStatement } from "./parse";

describe("inferYear", () => {
  it("usa o ano mais recente que não passa do mês de referência", () => {
    expect(inferYear(9, "2026-09")).toBe(2026);
    expect(inferYear(8, "2026-09")).toBe(2026);
    // Compra de dezembro na fatura de janeiro é do ano anterior.
    expect(inferYear(12, "2027-01")).toBe(2026);
  });
});

describe("detectReferenceMonth", () => {
  it("lê o vencimento na mesma linha", () => {
    expect(detectReferenceMonth(["Vencimento: 10/10/2026"], "2026-01")).toBe("2026-10");
  });

  it("lê o vencimento na linha seguinte ao rótulo", () => {
    expect(detectReferenceMonth(["Data de vencimento", "05/11/2026"], "2026-01")).toBe("2026-11");
  });

  it("sem vencimento, devolve o fallback", () => {
    expect(detectReferenceMonth(["nada aqui"], "2026-01")).toBe("2026-01");
  });
});

describe("parseStatement — fatura", () => {
  const card = (lines: string[]) => parseStatement(lines, "card", "2026-10");

  it("lê data, descrição e valor de uma compra à vista", () => {
    const [entry] = card(["12/09 IFOOD *RESTAURANTE R$ 45,90"]);
    expect(entry).toMatchObject({
      date: "2026-09-12",
      description: "IFOOD *RESTAURANTE",
      amountMinor: 4590,
      kind: "expense",
      installment: null,
      selected: true,
      note: null,
    });
  });

  it("aceita mês por extenso abreviado", () => {
    const [entry] = card(["03 SET Uber *Trip 12,34"]);
    expect(entry?.date).toBe("2026-09-03");
    expect(entry?.description).toBe("Uber *Trip");
  });

  it("usa o último valor da linha (moeda estrangeira vem antes)", () => {
    const [entry] = card(["20/09 AMAZON US 10,00 USD 55,20"]);
    expect(entry?.amountMinor).toBe(5520);
    expect(entry?.description).toBe("AMAZON US");
  });

  it("valores com milhar", () => {
    expect(card(["01/10 NOTEBOOK 3.456,78"])[0]?.amountMinor).toBe(345_678);
  });

  it("extrai a parcela e tira da descrição", () => {
    const [a] = card(["15/07 MAGAZINE LUIZA 03/10 150,00"]);
    expect(a?.installment).toEqual({ k: 3, n: 10 });
    expect(a?.description).toBe("MAGAZINE LUIZA");
    const [b] = card(["15/07 LOJA X PARC 2 DE 5 99,00"]);
    expect(b?.installment).toEqual({ k: 2, n: 5 });
    expect(b?.description).toBe("LOJA X");
  });

  it("ignora k/n impossível", () => {
    expect(card(["15/07 SALA 12/10 50,00"])[0]?.installment).toBeNull();
  });

  it("crédito vira receita marcada, com nota", () => {
    const [entry] = card(["18/09 ESTORNO LOJA X -80,00"]);
    expect(entry).toMatchObject({ kind: "income", amountMinor: 8000, selected: true });
    expect(entry?.note).not.toBeNull();
  });

  it("pagamento da fatura vem desmarcado", () => {
    const [entry] = card(["05/09 PAGAMENTO RECEBIDO -2.300,00"]);
    expect(entry).toMatchObject({ kind: "income", selected: false });
  });

  it("descarta linha sem data, sem valor ou sem descrição", () => {
    expect(
      card(["Total da fatura R$ 2.000,00", "12/09 SEM VALOR", "12/09 10,00", "99/99 X 1,00"]),
    ).toEqual([]);
  });

  it("guarda a descrição crua para identidade", () => {
    const [entry] = card(["12/09 IFOOD  *RESTAURANTE 45,90"]);
    expect(entry?.rawDescription).toBe("IFOOD *RESTAURANTE");
  });
});

describe("parseStatement — extrato", () => {
  const account = (lines: string[]) => parseStatement(lines, "account", "2026-09");

  it("usa o primeiro valor (o segundo é o saldo) e a data completa", () => {
    const [entry] = account(["10/08/2026 PIX ENVIADO FULANO -120,00 1.500,00"]);
    expect(entry).toMatchObject({
      date: "2026-08-10",
      kind: "expense",
      amountMinor: 12_000,
      selected: true,
    });
  });

  it("positivo é receita; sufixo D/C decide o sinal", () => {
    expect(account(["05/09 SALARIO EMPRESA 5.000,00"])[0]?.kind).toBe("income");
    expect(account(["05/09 TARIFA 12,00 D"])[0]?.kind).toBe("expense");
    expect(account(["05/09 TED RECEBIDA 12,00 C"])[0]?.kind).toBe("income");
  });

  it("descarta linhas de saldo", () => {
    expect(account(["05/09 SALDO DO DIA 1.000,00"])).toEqual([]);
  });

  it("pagamento de fatura vem desmarcado", () => {
    const [entry] = account(["05/09 PAG FATURA CARTAO NUBANK -2.300,00"]);
    expect(entry).toMatchObject({ kind: "expense", selected: false });
    expect(entry?.note).not.toBeNull();
  });

  it("extrato não tem parcela", () => {
    expect(account(["05/09 LOJA 03/10 -10,00"])[0]?.installment).toBeNull();
  });

  it("ano de dois dígitos", () => {
    expect(account(["05/09/26 TARIFA -1,00"])[0]?.date).toBe("2026-09-05");
  });
});
