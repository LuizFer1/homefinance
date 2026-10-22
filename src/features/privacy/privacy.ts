import { signal } from "@preact/signals";
import type { ThemeStorage } from "../theme/theme";

/**
 * Modo privacidade: esconde todo valor em dinheiro (uso em lugar público).
 *
 * Preferência do aparelho, como o tema: mora no `localStorage` e **não** no
 * IndexedDB, porque as tabelas sincronizam e o hub não tem o que fazer com ela.
 * É lida de forma síncrona antes do primeiro render, senão os valores piscariam
 * na tela antes de a máscara entrar.
 */
export const PRIVACY_KEY = "hf:hide-values";

export const MASK = "R$ •••••";

export const hideValues = signal(false);

let storage: ThemeStorage | null = null;

/** Lê a escolha gravada. Storage que falha (aba privada, permissão) vale "mostrar". */
export function initPrivacy(source: ThemeStorage): void {
  storage = source;
  try {
    hideValues.value = source.getItem(PRIVACY_KEY) === "1";
  } catch {
    hideValues.value = false;
  }
}

export function setHideValues(hidden: boolean): void {
  hideValues.value = hidden;
  try {
    storage?.setItem(PRIVACY_KEY, hidden ? "1" : "0");
  } catch {
    // Vale nesta sessão mesmo sem conseguir persistir.
  }
}
