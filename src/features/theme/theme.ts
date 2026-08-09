/**
 * Preferência de tema do aparelho.
 *
 * Não é dado de domínio e por isso **não entra no log de eventos**: o log é
 * append-only e sincroniza entre aparelhos, então gravar o tema ali imporia a
 * escolha de um celular ao outro. Tema é preferência local — mora no
 * `localStorage`, que é síncrono e por isso não pisca no primeiro paint.
 */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "hf:theme";
export const DATA_THEME = "data-theme";

const THEMES: Record<Exclude<ThemePreference, "system">, string> = {
  light: "hf-light",
  dark: "hf-dark",
};

/** Só o que este módulo usa do `Storage` — o teste injeta um mapa. */
export interface ThemeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function isPreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readPreference(storage: ThemeStorage): ThemePreference {
  try {
    const stored = storage.getItem(THEME_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    // Aba privada, quota, permissão negada: o tema é a última coisa que pode
    // derrubar o app. Sem preferência lida, o sistema decide.
    return "system";
  }
}

export function writePreference(storage: ThemeStorage, preference: ThemePreference): void {
  try {
    storage.setItem(THEME_KEY, preference);
  } catch {
    // A escolha vale para esta sessão mesmo sem conseguir persistir.
  }
}

/**
 * 'system' **remove** o atributo em vez de fixar um tema: é a ausência dele que
 * devolve a decisão ao `prefers-color-scheme` e faz o app acompanhar o sistema
 * quando ele vira sozinho ao anoitecer.
 */
export function applyPreference(root: HTMLElement, preference: ThemePreference): void {
  if (preference === "system") {
    root.removeAttribute(DATA_THEME);
    return;
  }
  root.setAttribute(DATA_THEME, THEMES[preference]);
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): "light" | "dark" {
  if (preference !== "system") return preference;
  return prefersDark ? "dark" : "light";
}

/**
 * Mantém a cor da barra do navegador coerente com o tema escolhido.
 *
 * As duas cores moram no `index.html`, nas metas com `media` — aqui elas são
 * lidas de lá em vez de repetidas, senão trocar a paleta exigiria lembrar de
 * dois lugares. Passe `null` para voltar ao comportamento do sistema.
 */
export function syncThemeColor(doc: Document, theme: "light" | "dark" | null): void {
  const existente = doc.head.querySelector<HTMLMetaElement>("meta[name=theme-color]:not([media])");

  if (theme === null) {
    existente?.remove();
    return;
  }

  const fonte = doc.head.querySelector<HTMLMetaElement>(
    `meta[name=theme-color][media*="${theme}"]`,
  );
  if (fonte === null) return;

  // Sem `media` e em primeiro lugar: o navegador usa a primeira meta cuja
  // media casa, e uma meta sem media casa sempre.
  const meta = existente ?? doc.createElement("meta");
  meta.name = "theme-color";
  meta.content = fonte.content;
  if (meta.parentNode === null) doc.head.prepend(meta);
}
