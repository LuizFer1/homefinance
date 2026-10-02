import type { HomeFinanceDb } from "../data/db";
import { type HubLink, readHubLink, writeHubLink } from "../data/hub-link";
import type { Ulid } from "../domain/ids/ulid";
import { normalizeAddress, normalizeToken } from "../features/sync/address";
import { type HubTransport, SyncError } from "./transport";

export interface PairDeps {
  db: HomeFinanceDb;
  transport: HubTransport;
  deviceId: Ulid;
  /** `meta.localUserId`: só para a tela Conexão do hub mostrar a pessoa. */
  userId: Ulid | null;
}

export interface PairInput {
  address: string;
  token: string;
  deviceName: string;
}

const MAX_NAME = 64;

/**
 * Troca o código de uso único pela chave de longa duração e grava a ligação.
 * Erro de rede ou de código não grava nada: o aparelho continua como estava.
 */
export async function pairWithHub(deps: PairDeps, input: PairInput): Promise<HubLink> {
  const address = normalizeAddress(input.address);
  if (address === null)
    throw new SyncError("hub", "Endereço do hub inválido. Use ip:porta, como 192.168.0.5:7777.");
  const token = normalizeToken(input.token);
  if (token === null)
    throw new SyncError("hub", "Código inválido: são 6 letras e números, como ABC-DEF.");
  const deviceName = input.deviceName.trim();
  if (deviceName.length === 0 || deviceName.length > MAX_NAME) {
    throw new SyncError("hub", "Nome do aparelho precisa ter de 1 a 64 caracteres.");
  }

  const response = await deps.transport.pair(address, {
    token,
    deviceId: deps.deviceId,
    name: deviceName,
    userId: deps.userId,
  });
  await writeHubLink(deps.db, {
    address,
    name: response.hubName,
    key: response.key,
    epoch: response.epoch,
    deviceName,
  });
  const link = await readHubLink(deps.db);
  if (link === null) throw new SyncError("hub", "A ligação com o hub não foi gravada.");
  return link;
}
