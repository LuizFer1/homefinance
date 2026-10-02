import type { HubLink } from "../../data/hub-link";
import type { SyncErrorKind } from "../../sync/transport";
import { describeError } from "../session/session";

export type SyncStatus = "idle" | "pairing" | "syncing";

export type SyncFailureKind = SyncErrorKind | "module" | "unknown";

export interface SyncFailure {
  kind: SyncFailureKind;
  message: string;
}

const MESSAGES: Partial<Record<SyncFailureKind, string>> = {
  unreachable:
    "Não foi possível falar com o hub. Confira se ele está aberto, se o celular está no mesmo Wi-Fi e se o certificado do hub foi instalado.",
  timeout: "O hub demorou demais para responder.",
  unauthorized: "Este aparelho foi removido do hub. Pareie de novo.",
  invalid_token: "Código inválido ou expirado. Gere outro no hub.",
  protocol: "Resposta inesperada do hub. Atualize o app e o hub.",
};

/**
 * `SyncError` mora no chunk; importar a classe aqui traria o chunk inteiro
 * para o shell. O shell a reconhece pela forma.
 */
function isSyncError(cause: unknown): cause is Error & { kind: SyncErrorKind } {
  return (
    cause instanceof Error &&
    cause.name === "SyncError" &&
    typeof (cause as { kind?: unknown }).kind === "string"
  );
}

export function describeFailure(cause: unknown): SyncFailure {
  if (cause instanceof Error && cause.name === "SyncModuleUnavailableError") {
    const offline = (cause as { offline?: unknown }).offline === true;
    return {
      kind: "module",
      message: offline
        ? "O módulo de sincronização ainda não foi baixado. Conecte à internet uma vez e tente de novo."
        : // `onLine` também vale para Wi-Fi de casa sem internet: o chunk pode
          // ser de uma versão que o deploy apagou ou nunca ter sido baixado.
          "Não foi possível carregar o módulo de sincronização. Atualize o app ou, se este aparelho nunca sincronizou, conecte à internet uma vez para baixá-lo, e tente de novo.",
    };
  }
  if (isSyncError(cause))
    return { kind: cause.kind, message: MESSAGES[cause.kind] ?? cause.message };
  return { kind: "unknown", message: describeError(cause) };
}

const DATE = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

export interface HubStatusInput {
  link: HubLink | null;
  status: SyncStatus;
  revoked: boolean;
  lastError: SyncFailure | null;
  lastSyncAt: string | null;
}

/** A segunda linha de "Sincronizar com o hub" nos Ajustes e na sub-tela. */
export function describeHubStatus(input: HubStatusInput): string {
  if (input.link === null) return "Um programa no seu computador — nunca um servidor de terceiros.";
  if (input.status === "syncing") return "Sincronizando…";
  if (input.status === "pairing") return "Pareando…";
  if (input.revoked) return "Desconectado do hub. Toque para parear de novo.";
  if (input.lastError !== null) {
    const { kind, message } = input.lastError;
    return kind === "unreachable" || kind === "timeout"
      ? "Hub fora de alcance na última tentativa."
      : message;
  }
  if (input.lastSyncAt !== null) {
    const date = new Date(input.lastSyncAt);
    if (!Number.isNaN(date.getTime())) return `Último sync: ${DATE.format(date)}`;
  }
  return "Pareado. Ainda não sincronizou.";
}
