import { useState } from "preact/hooks";
import { IconTile } from "../ui/tile";
import type { CheckResult, UpdateStore } from "./store";

type Status = "idle" | "checking" | Exclude<CheckResult, "skipped" | "ready">;

const MESSAGES: Record<Exclude<Status, "idle" | "checking">, string> = {
  current: "Você está na versão mais recente.",
  installing: "Baixando a versão nova…",
  offline: "Sem conexão. Tente de novo com internet.",
  unavailable: "Atualização indisponível neste navegador.",
};

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

function describeVersion(version: string | null): string {
  if (version === null) return "Versão desconhecida";
  const date = new Date(version);
  return Number.isNaN(date.getTime()) ? "Versão desconhecida" : `Versão de ${DATE.format(date)}`;
}

/**
 * Linha "Atualização" dos Ajustes. O aviso de fundo só busca versão nova ao
 * voltar para o app, e no máximo a cada 30 min; aqui a pessoa pergunta na hora,
 * e precisa de uma resposta — um toque sem retorno parece botão quebrado.
 */
export function UpdateSection({ update }: { update: UpdateStore }) {
  const [status, setStatus] = useState<Status>("idle");
  const ready = update.ready.value;

  async function handleCheck() {
    setStatus("checking");
    const result = await update.check(true);
    // `ready` já liga o sinal; "skipped" não acontece com `force`.
    setStatus(result === "ready" || result === "skipped" ? "idle" : result);
  }

  const message = ready
    ? "Nova versão pronta. Atualizar recarrega o app."
    : status === "idle" || status === "checking"
      ? describeVersion(update.version)
      : MESSAGES[status];

  return (
    <div class="relative flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
      <IconTile icon="arrows-clockwise" color={null} size={36} iconSize={18} />
      <span class="min-w-0 flex-1">
        <span class="block text-[15px]">Atualização</span>
        <span role="status" class="mt-0.5 block text-xs leading-snug text-fg/55">
          {message}
        </span>
      </span>
      {ready ? (
        <button
          type="button"
          onClick={update.apply}
          class="hf-press shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent-300
            hover:bg-accent/15"
        >
          Atualizar
        </button>
      ) : (
        <button
          type="button"
          onClick={handleCheck}
          disabled={status === "checking" || status === "installing"}
          class="hf-press shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent-300
            hover:bg-accent/15 disabled:pointer-events-none disabled:opacity-45"
        >
          {status === "checking" ? "Verificando…" : "Verificar"}
        </button>
      )}
    </div>
  );
}
