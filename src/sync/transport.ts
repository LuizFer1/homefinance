import { hubBaseUrl } from "../features/sync/address";
import {
  type ErrorBody,
  isPairResponse,
  isPullResponse,
  isPushResponse,
  type PairRequest,
  type PairResponse,
  type PullQuery,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from "./protocol";

export type SyncErrorKind =
  /**
   * `fetch` lançou: hub fechado, IP errado, Wi-Fi diferente, TLS não confiável
   * ou rede local negada. O navegador não distingue, então a tela também não.
   */
  | "unreachable"
  | "timeout"
  | "invalid_token"
  | "unauthorized"
  | "epoch_mismatch"
  /** Outro 4xx/5xx; `message` é a do hub ou "O hub respondeu N." */
  | "hub"
  /** 2xx fora do formato, 409 sem epoch, cursor que não avança. */
  | "protocol";

/**
 * Um erro, um `kind`. O shell não importa esta classe (traria o chunk junto):
 * reconhece-a por `name === "SyncError"` e `kind` (ver `features/sync/status.ts`).
 */
export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  /** Só em `epoch_mismatch`: a epoch atual do hub. */
  readonly epoch: string | null;

  constructor(
    kind: SyncErrorKind,
    message: string,
    extra: { status?: number; code?: string; epoch?: string; cause?: unknown } = {},
  ) {
    super(message, extra.cause === undefined ? undefined : { cause: extra.cause });
    this.name = "SyncError";
    this.kind = kind;
    this.status = extra.status ?? null;
    this.code = extra.code ?? null;
    this.epoch = extra.epoch ?? null;
  }
}

export interface HubTransport {
  pair: (address: string, body: PairRequest) => Promise<PairResponse>;
  push: (address: string, key: string, body: PushRequest) => Promise<PushResponse>;
  pull: (address: string, key: string, query: PullQuery) => Promise<PullResponse>;
}

export interface HubTransportDeps {
  fetch: typeof fetch;
  timeoutMs?: number;
}

/** O mesmo do hub: na LAN a resposta vem em ms; o teto só evita um PC dormindo travar a tela. */
export const REQUEST_TIMEOUT_MS = 30_000;

const UNREACHABLE =
  "Não foi possível falar com o hub. Confira se ele está aberto, se o celular está no mesmo Wi-Fi e se o certificado do hub foi instalado.";

async function readJson(response: Response): Promise<unknown> {
  // O `408` do timeout do hub volta sem corpo, e um proxy pode devolver HTML:
  // nunca assumir que há JSON.
  const text = await response.text().catch(() => "");
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorBody(json: unknown): Partial<ErrorBody> {
  if (typeof json !== "object" || json === null) return {};
  const { error, message, epoch } = json as Record<string, unknown>;
  return {
    error: typeof error === "string" ? error : undefined,
    message: typeof message === "string" ? message : undefined,
    epoch: typeof epoch === "string" ? epoch : undefined,
  };
}

export function createHubTransport({
  fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}: HubTransportDeps): HubTransport {
  async function request<T>(
    method: "GET" | "POST",
    url: string,
    options: { key?: string; body?: unknown; guard: (value: unknown) => value is T },
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.key !== undefined) headers.authorization = `Bearer ${options.key}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        // Sem cookies e sem cache: a credencial é o Bearer, e um pull servido do
        // cache HTTP devolveria uma página velha com o mesmo cursor.
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        signal:
          typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new SyncError("timeout", "O hub demorou demais para responder.", { cause });
      }
      throw new SyncError("unreachable", UNREACHABLE, { cause });
    }

    const json = await readJson(response);
    if (response.ok) {
      if (!options.guard(json)) throw new SyncError("protocol", "Resposta inesperada do hub.");
      return json;
    }

    const { error: code, message, epoch } = errorBody(json);
    const extra = { status: response.status, code };
    const text = message ?? `O hub respondeu ${response.status}.`;
    if (response.status === 401) {
      throw new SyncError(code === "invalid_token" ? "invalid_token" : "unauthorized", text, extra);
    }
    if (response.status === 409 && code === "epoch_mismatch") {
      if (epoch === undefined) {
        throw new SyncError("protocol", "O hub mudou de epoch sem dizer qual.", extra);
      }
      throw new SyncError("epoch_mismatch", text, { ...extra, epoch });
    }
    throw new SyncError("hub", text, extra);
  }

  return {
    pair: (address, body) =>
      request("POST", `${hubBaseUrl(address)}/v1/pair`, { body, guard: isPairResponse }),
    push: (address, key, body) =>
      request("POST", `${hubBaseUrl(address)}/v1/push`, { key, body, guard: isPushResponse }),
    pull: (address, key, { epoch, cursor, limit }) => {
      const params = new URLSearchParams({ epoch, cursor: String(cursor), limit: String(limit) });
      return request("GET", `${hubBaseUrl(address)}/v1/pull?${params}`, {
        key,
        guard: isPullResponse,
      });
    },
  };
}
