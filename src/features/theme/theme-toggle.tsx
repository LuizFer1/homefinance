import { useLayoutEffect, useState } from "preact/hooks";
import { Segmented, type SegmentOption } from "../ui/segmented";
import {
  applyPreference,
  readPreference,
  syncThemeColor,
  type ThemePreference,
  type ThemeStorage,
  writePreference,
} from "./theme";

export interface ThemeToggleProps {
  storage: ThemeStorage;
  doc: Document;
}

/**
 * Três estados, não dois.
 *
 * Um botão de duas posições obriga quem nunca mexeu nisso a ficar preso a um
 * tema fixo: no momento em que ele grava "claro", o app para de acompanhar o
 * sistema para sempre. 'Sistema' é o padrão e precisa ser um destino de volta.
 */
const OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: "light", label: "Claro", icon: "sun" },
  { value: "dark", label: "Escuro", icon: "moon", iconFillWhenOn: true },
  { value: "system", label: "Sistema", icon: "circle-half" },
];

export function ThemeToggle({ storage, doc }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>(() => readPreference(storage));

  /*
   * `useLayoutEffect` e não `useEffect`: aplicar depois do paint deixaria um
   * quadro com o tema antigo, que num app inteiro é um flash de tela branca.
   * Aplicar aqui (e não no clique) também cobre o primeiro render, caso o
   * script inline do index.html não tenha rodado.
   */
  useLayoutEffect(() => {
    applyPreference(doc.documentElement, preference);
    syncThemeColor(doc, preference === "system" ? null : preference);
  }, [doc, preference]);

  function choose(next: ThemePreference) {
    setPreference(next);
    writePreference(storage, next);
  }

  return (
    <Segmented name="theme" legend="Tema" options={OPTIONS} value={preference} onChange={choose} />
  );
}
