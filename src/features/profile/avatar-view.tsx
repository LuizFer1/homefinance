import { cssVarForToken } from "../colors/color-token";

export interface AvatarProps {
  name: string;
  color: string;
  avatar: string | null;
  /** Lado em pixels. O padrão serve ao cabeçalho. */
  size?: number;
}

/**
 * Lista de **permissão**, não de bloqueio.
 *
 * O valor vem do log, e o log vem do aparelho da outra pessoa via sync: é
 * entrada não confiável, e o fold a aceitou de propósito para não perder dado de
 * uma versão mais nova. A restrição mora aqui, onde é reversível.
 *
 * `data:image/svg+xml` é recusado. Num `<img>` o script de um SVG não executa,
 * então isto não corrige um furo conhecido — recusa um formato que carrega
 * script quando três formatos rasterizados já resolvem o caso inteiro. Url
 * remota cai junto: nenhuma requisição de rede sai deste app.
 */
const ALLOWED = ["data:image/webp;", "data:image/jpeg;", "data:image/png;"];

export function isDisplayableAvatar(value: string | null): value is string {
  return value !== null && ALLOWED.some((prefix) => value.startsWith(prefix));
}

/**
 * Iniciais do nome.
 *
 * Não é placeholder à espera de foto: é o fallback permanente de quem escolheu
 * não ter foto, e precisa ficar apresentável para sempre. Primeira e última
 * palavra, porque nome do meio não distingue duas pessoas da mesma casa.
 */
export function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part !== "");
  if (parts.length === 0) return "?";

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase("pt-BR");
}

export function Avatar({ name, color, avatar, size = 36 }: AvatarProps) {
  const box = { width: `${size}px`, height: `${size}px` };

  if (isDisplayableAvatar(avatar)) {
    return (
      <img
        src={avatar}
        alt={`Foto de ${name}`}
        style={box}
        class="shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      // A inicial acompanha o disco (40% do lado): 44px no avatar de 112 do
      // onboarding, ~14px no de 36 do cabeçalho. Um tamanho fixo sumiria num e
      // estouraria o outro.
      style={{ ...box, backgroundColor: cssVarForToken(color), fontSize: `${size * 0.4}px` }}
      class="flex shrink-0 items-center justify-center rounded-full font-medium text-bg"
    >
      {initialsFor(name)}
    </span>
  );
}

/**
 * Autor do lançamento em 14px, antes de "Categoria · Forma".
 *
 * Só a cor e a inicial, nunca a foto: 96px de foto renderizados a 14 viram um
 * borrão, e a pergunta que a marca responde é só "quem lançou".
 */
export function MiniAvatar({ name, color }: { name: string; color: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="author-mark"
      style={{ backgroundColor: cssVarForToken(color) }}
      class="inline-grid size-3.5 shrink-0 place-items-center rounded-full text-[8px]
        font-semibold leading-none text-bg"
    >
      {initialsFor(name).slice(0, 1)}
    </span>
  );
}
