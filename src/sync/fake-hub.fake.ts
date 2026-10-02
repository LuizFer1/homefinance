import { compareHlc, parseHlc } from "../domain/clock/hlc";

/**
 * Hub em memória que implementa o contrato de
 * `docs/desktop/specs/2026-10-01-hub-sync-nucleo-design.md`: LWW
 * lexicográfico, `seq`, exclusão da origem no pull, paginação `limit+1`,
 * `dirty` removido, erros com o JSON da spec. Quando o hub real mudar, este
 * arquivo muda junto — é o contrato que os testes do app exercitam.
 */

const ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TABLE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const DEFAULT_EPOCH = "01J9ZZZZZZZZZZZZZZZZZZZZZZ";

export interface FakeHubRow {
  table: string;
  id: string;
  seq: number;
  origin: string;
  row: Record<string, unknown>;
}

export interface FakeDevice {
  deviceId: string;
  name: string;
  userId: string | null;
  key: string;
  revoked: boolean;
}

export interface FakeCall {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

export type FakeFailure = "network" | "timeout" | "internal" | "empty408";

export interface FakeHub {
  fetch: typeof fetch;
  readonly epoch: string;
  readonly calls: FakeCall[];
  /** Token ativo de 6 chars Crockford; substitui o anterior. */
  issueToken: () => string;
  revoke: (deviceId: string) => void;
  /**
   * Banco novo: epoch nova, sem linhas. `keepDevices` mantém os aparelhos (a
   * chave continua válida e o app recebe `409`); sem ele, o app recebe `401`,
   * como num hub reinstalado do zero.
   */
  recreate: (keepDevices?: boolean) => void;
  rows: () => FakeHubRow[];
  devices: () => FakeDevice[];
  maxSeq: () => number;
  /** A próxima requisição falha do jeito pedido, uma vez. */
  failNext: (mode: FakeFailure) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fail(status: number, code: string, message: string, epoch?: string): Response {
  return json(
    status,
    epoch === undefined ? { error: code, message } : { error: code, message, epoch },
  );
}

type Checked = { table: string; row: Record<string, unknown> } | string;

function checkEntry(entry: unknown): Checked {
  if (!isRecord(entry)) return "invalid_request";
  const { table, row } = entry;
  if (typeof table !== "string" || !TABLE.test(table)) return "invalid_table";
  if (!isRecord(row)) return "row_not_object";
  if (typeof row.id !== "string" || !ID.test(row.id)) return "invalid_id";
  if (typeof row.updatedAt !== "string" || parseHlc(row.updatedAt) === null)
    return "invalid_updated_at";
  if (
    row.deletedAt !== null &&
    (typeof row.deletedAt !== "string" || parseHlc(row.deletedAt) === null)
  ) {
    return "invalid_deleted_at";
  }
  const { dirty: _dirty, ...rest } = row;
  return { table, row: rest };
}

export function createFakeHub(options: { epoch?: string } = {}): FakeHub {
  let epoch = options.epoch ?? DEFAULT_EPOCH;
  let rows = new Map<string, FakeHubRow>();
  let devices = new Map<string, FakeDevice>();
  let maxSeq = 0;
  let token: string | null = null;
  let tokenCounter = 0;
  let keyCounter = 0;
  let failure: FakeFailure | null = null;
  const calls: FakeCall[] = [];

  function authenticate(auth: string | null): FakeDevice | null {
    const key = auth?.replace(/^Bearer\s+/i, "").trim() ?? "";
    for (const device of devices.values()) {
      if (device.key === key && !device.revoked) return device;
    }
    return null;
  }

  function pair(body: Record<string, unknown>): Response {
    const { deviceId, name, userId } = body;
    if (typeof deviceId !== "string" || !ID.test(deviceId)) {
      return fail(400, "invalid_request", "deviceId precisa ter 26 caracteres Crockford.");
    }
    if (
      userId !== undefined &&
      userId !== null &&
      (typeof userId !== "string" || !ID.test(userId))
    ) {
      return fail(400, "invalid_request", "userId precisa ter 26 caracteres Crockford.");
    }
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (trimmed.length === 0 || trimmed.length > 64) {
      return fail(400, "invalid_request", "O nome do aparelho precisa ter de 1 a 64 caracteres.");
    }
    const candidate =
      typeof body.token === "string" ? body.token.replace(/[-\s]/g, "").toUpperCase() : "";
    if (token === null || candidate !== token) {
      return fail(401, "invalid_token", "Código inválido ou expirado.");
    }
    token = null;
    keyCounter += 1;
    const key = keyCounter.toString(16).padStart(64, "0");
    devices.set(deviceId, {
      deviceId,
      name: trimmed,
      userId: typeof userId === "string" ? userId : null,
      key,
      revoked: false,
    });
    return json(201, { deviceId, key, epoch, hubName: "HubFinance" });
  }

  function push(device: FakeDevice, body: Record<string, unknown>): Response {
    if (body.epoch !== epoch) {
      return fail(409, "epoch_mismatch", "O hub foi recriado; sincronizando tudo de novo.", epoch);
    }
    if (!Array.isArray(body.rows))
      return fail(400, "invalid_request", "rows precisa ser uma lista.");
    if (body.rows.length > 1000)
      return fail(400, "too_many_rows", "Mais de 1000 linhas num envio.");

    const accepted: { table: string; id: string; seq: number }[] = [];
    const ignored: { table: string; id: string; reason: string }[] = [];
    const rejected: { index: number; error: string; message: string }[] = [];
    body.rows.forEach((entry: unknown, index: number) => {
      const checked = checkEntry(entry);
      if (typeof checked === "string") {
        rejected.push({ index, error: checked, message: `linha ${index}: ${checked}` });
        return;
      }
      const id = checked.row.id as string;
      const updatedAt = checked.row.updatedAt as string;
      const key = `${checked.table}/${id}`;
      const current = rows.get(key);
      if (current !== undefined) {
        const cmp = compareHlc(updatedAt, current.row.updatedAt as string);
        if (cmp <= 0) {
          ignored.push({ table: checked.table, id, reason: cmp === 0 ? "same" : "older" });
          return;
        }
      }
      maxSeq += 1;
      rows.set(key, {
        table: checked.table,
        id,
        seq: maxSeq,
        origin: device.deviceId,
        row: checked.row,
      });
      accepted.push({ table: checked.table, id, seq: maxSeq });
    });
    return json(200, { epoch, accepted, ignored, rejected, seq: maxSeq });
  }

  function pull(device: FakeDevice, params: URLSearchParams): Response {
    if (params.get("epoch") !== epoch) {
      return fail(409, "epoch_mismatch", "O hub foi recriado; sincronizando tudo de novo.", epoch);
    }
    const cursor = Number(params.get("cursor") ?? "0");
    const limit = Number(params.get("limit") ?? "500");
    if (!Number.isInteger(cursor) || cursor < 0) {
      return fail(400, "invalid_request", "cursor não pode ser negativo.");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      return fail(400, "invalid_request", "limit precisa estar entre 1 e 1000.");
    }
    const candidates = [...rows.values()]
      .filter((row) => row.seq > cursor && row.origin !== device.deviceId)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit + 1);
    const hasMore = candidates.length > limit;
    const page = candidates.slice(0, limit);
    const last = page[page.length - 1];
    return json(200, {
      epoch,
      rows: page.map((row) => ({ table: row.table, seq: row.seq, row: row.row })),
      cursor: hasMore && last !== undefined ? last.seq : maxSeq,
      hasMore,
    });
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(href);
    const method = (init?.method ?? "GET").toUpperCase();
    const auth = new Headers(init?.headers).get("authorization");
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    calls.push({ method, path: url.pathname + url.search, auth, body });

    if (failure !== null) {
      const mode = failure;
      failure = null;
      if (mode === "network") throw new TypeError("Failed to fetch");
      if (mode === "timeout")
        throw Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
      if (mode === "empty408") return new Response(null, { status: 408 });
      return fail(500, "internal", "Erro interno do hub.");
    }

    if (method === "GET" && url.pathname === "/v1/info") {
      return json(200, { name: "HubFinance", version: "0.1.0", protocol: 1, epoch });
    }
    if (method === "POST" && url.pathname === "/v1/pair") return pair(isRecord(body) ? body : {});

    const device = authenticate(auth);
    if (device === null) {
      return fail(401, "unauthorized", "Aparelho não pareado ou revogado. Pareie de novo.");
    }
    if (method === "POST" && url.pathname === "/v1/push")
      return push(device, isRecord(body) ? body : {});
    if (method === "GET" && url.pathname === "/v1/pull") return pull(device, url.searchParams);
    if (method === "GET" && url.pathname === "/v1/me") {
      return json(200, {
        deviceId: device.deviceId,
        name: device.name,
        pairedAt: "2026-10-01T18:00:00Z",
        epoch,
        userId: device.userId,
      });
    }
    return fail(404, "not_found", "Rota desconhecida.");
  };

  return {
    fetch: fetchImpl,
    get epoch() {
      return epoch;
    },
    calls,
    issueToken() {
      tokenCounter += 1;
      // `T` + cinco dígitos: 6 chars, todos no alfabeto Crockford.
      token = `T${String(tokenCounter).padStart(5, "0")}`;
      return token;
    },
    revoke(deviceId) {
      const device = devices.get(deviceId);
      if (device !== undefined) device.revoked = true;
    },
    recreate(keepDevices = false) {
      epoch = epoch.endsWith("Z") ? `${epoch.slice(0, 25)}Y` : `${epoch.slice(0, 25)}Z`;
      rows = new Map();
      maxSeq = 0;
      token = null;
      if (!keepDevices) devices = new Map();
    },
    rows: () => [...rows.values()].sort((a, b) => a.seq - b.seq),
    devices: () => [...devices.values()],
    maxSeq: () => maxSeq,
    failNext(mode) {
      failure = mode;
    },
  };
}
