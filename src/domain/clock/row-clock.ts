import { createUlidFactory, type RandomChunk, type Ulid } from "../ids/ulid";
import { createHlcClock } from "./hlc";

export interface RowClockDeps {
  deviceId: Ulid;
  /** Maior HLC já gravado, para o relógio não regredir depois de um reboot. */
  initialHlc?: string | null;
  now: () => number;
  randomChunk: RandomChunk;
}

export interface Stamp {
  hlc: string;
  iso: string;
}

/**
 * Um relógio por aparelho, compartilhado por todas as escritas. `updatedAt` sai
 * do HLC e não de `Date.now()` cru: no LWW por linha do hub, um celular com a
 * hora adiantada venceria todo conflito.
 */
export interface RowClock {
  readonly deviceId: Ulid;
  /** Um `now()` só alimenta o HLC e o ISO, para os dois falarem do mesmo instante. */
  stamp: () => Stamp;
  newId: () => Ulid;
}

export function createRowClock(deps: RowClockDeps): RowClock {
  const nextUlid = createUlidFactory(deps.randomChunk);
  const hlc = createHlcClock(deps.deviceId, deps.initialHlc ?? null);

  return {
    deviceId: deps.deviceId,
    stamp() {
      const millis = deps.now();
      return { hlc: hlc.tick(millis), iso: new Date(millis).toISOString() };
    },
    newId: () => nextUlid(deps.now()),
  };
}
