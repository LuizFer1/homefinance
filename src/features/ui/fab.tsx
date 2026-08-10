export interface FabProps {
  label: string;
  onSelect: () => void;
}

/**
 * Botão de criação flutuante.
 *
 * Extraído porque três telas o usam e o posicionamento depende de
 * `--hf-nav-h` — a altura da barra inferior. Copiado em cada tela, um ajuste na
 * barra deixaria os botões em alturas diferentes, e o desalinhamento só
 * apareceria em quem trocasse de aba.
 *
 * À direita e acima da barra: é a zona que o polegar alcança sem reposicionar a
 * mão.
 */
export function Fab({ label, onSelect }: FabProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      class="hf-press fixed right-[max(1.25rem,calc(50vw-13rem))]
        bottom-[calc(var(--hf-nav-h)+env(safe-area-inset-bottom)+1rem)] z-20 flex size-14
        items-center justify-center rounded-full bg-primary text-2xl leading-none
        text-primary-content shadow-lg"
    >
      +
    </button>
  );
}
