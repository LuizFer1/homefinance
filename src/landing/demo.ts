import type { Lang } from "./i18n";

/**
 * Demonstracao do celular no hero: 15s em loop — toca no "+", preenche um
 * lancamento de R$ 38,90 em Alimentacao, salva, e o saldo desce.
 *
 * Todo valor da tela e derivado so do relogio `t` (ms desde o inicio do ciclo),
 * como no handoff. Sem estado acumulado, nao ha como a demo "dessincronizar":
 * pausar, pular quadros ou voltar da aba em segundo plano da sempre a mesma
 * tela para o mesmo `t`.
 */
export const LOOP_MS = 15_000;

/** Tela parada para quem pede menos movimento: o inicio, sem o assistente. */
export const STILL_T = 1000;

/** Instantes (ms) de cada toque, do roteiro do handoff. */
const TAP = {
  plus: 2200,
  expense: 3700,
  k3: 4700,
  k8: 5100,
  k9: 5500,
  k0: 5900,
  next: 6300,
  food: 7500,
  today: 8900,
  save: 9600,
} as const;

export type TapName = keyof typeof TAP;

const KEY_TAPS: ReadonlyArray<[key: string, tap: TapName]> = [
  ["3", "k3"],
  ["8", "k8"],
  ["9", "k9"],
  ["0", "k0"],
];

/** 0 = inicio; 1–4 = passos do assistente; 5 = salvo, de volta ao inicio. */
export type Step = 0 | 1 | 2 | 3 | 4 | 5;

export interface Tap {
  /** Opacidade do circulo do toque. */
  o: number;
  /** Escala do circulo do toque. */
  s: number;
}

export interface DemoFrame {
  screenVisible: boolean;
  step: Step;
  wizardOpen: boolean;
  /** Passo exibido no cabecalho "N de 4". */
  stepNumber: number;
  chips: { type: boolean; amount: boolean; category: boolean };
  selected: { expense: boolean; food: boolean; today: boolean };
  savePressed: boolean;
  /** Valor digitado no teclado, em centavos. */
  cents: number;
  caretOn: boolean;
  /** Tecla afundada neste quadro, se houver. */
  pressedKey: string | null;
  taps: Record<TapName, Tap>;
  toast: boolean;
  newRow: boolean;
  balance: number;
  spent: number;
  /** Largura da barra de gasto, em %. */
  barPct: number;
}

const easeOutCubic = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3);

/** Circulo do toque: cresce de .7 a 1.2 e some em 600ms. */
function tap(t: number, at: number): Tap {
  const p = (t - at + 150) / 600;
  if (p < 0 || p > 1) return { o: 0, s: 0.6 };
  return { o: p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7, s: 0.7 + 0.5 * p };
}

function stepAt(t: number): Step {
  if (t < 2600) return 0;
  if (t < 4300) return 1;
  if (t < 6600) return 2;
  if (t < 8100) return 3;
  if (t < 10000) return 4;
  return 5;
}

export function demoFrame(rawT: number): DemoFrame {
  const t = ((rawT % LOOP_MS) + LOOP_MS) % LOOP_MS;
  const step = stepAt(t);
  const typed = KEY_TAPS.filter(([, name]) => t >= TAP[name] + 100).length;
  const k = easeOutCubic((t - 10_300) / 1000);

  const taps = Object.fromEntries(
    (Object.keys(TAP) as TapName[]).map((name) => [name, tap(t, TAP[name])]),
  ) as Record<TapName, Tap>;

  const pressed = KEY_TAPS.find(([, name]) => t >= TAP[name] - 60 && t < TAP[name] + 220);

  return {
    screenVisible: t >= 400 && t <= 14_500,
    step,
    wizardOpen: step >= 1 && step <= 4,
    stepNumber: Math.max(1, Math.min(4, step)),
    chips: { type: t >= 3800, amount: t >= 6400, category: t >= 7600 },
    selected: { expense: t >= 3800, food: t >= 7600, today: t >= 9000 },
    savePressed: t >= 9600 && t < 10_000,
    cents: Number.parseInt("3890".slice(0, typed) || "0", 10),
    caretOn: Math.floor(t / 500) % 2 === 0,
    pressedKey: pressed ? pressed[0] : null,
    taps,
    toast: t >= 10_150 && t < 12_600,
    newRow: t >= 10_300,
    balance: 2988 - 38.9 * k,
    spent: 2212 + 38.9 * k,
    barPct: 73.7 + 1.3 * k,
  };
}

/**
 * Valor em partes, no formato do idioma: `pt` = 2.988,00, `en` = 2,988.00. O
 * separador decimal vai junto da parte decimal porque a tela desenha as duas
 * partes em tamanhos diferentes.
 */
export function moneyParts(value: number, lang: Lang): { int: string; dec: string } {
  const [int = "0", dec = "00"] = Math.abs(value).toFixed(2).split(".");
  const group = lang === "pt" ? "." : ",";
  return {
    int: int.replace(/\B(?=(\d{3})+(?!\d))/g, group),
    dec: `${lang === "pt" ? "," : "."}${dec}`,
  };
}

export const currency = (lang: Lang) => (lang === "pt" ? "R$" : "$");
