import type { Envelope } from "../events/reference";
import { createUlidFactory, type RandomChunk, type Ulid } from "../ids/ulid";
import { createHlcClock } from "./hlc";

export interface DeviceClockDeps {
  deviceId: Ulid;
  /** Maior HLC já conhecido, para o relógio não regredir depois de um reboot. */
  initialHlc?: string | null;
  now: () => number;
  randomChunk: RandomChunk;
}

/**
 * Um relógio por aparelho, não um por store.
 *
 * Duas stores com relógios independentes produziriam HLCs entrelaçados: cada
 * escrita de uma cairia antes do `lastHlc` da outra e forçaria refold do log
 * inteiro a cada tecla. Pior, `compareEvents` continuaria correto — o sintoma
 * seria apenas lentidão crescente com o tamanho do log, que ninguém liga à causa.
 */
export interface DeviceClock {
  readonly deviceId: Ulid;
  /** Envelope para um evento sobre uma entidade que já existe. */
  envelope: (entityId: Ulid) => Envelope;
  /** Envelope para uma entidade nova, com o `entityId` recém-gerado. */
  newEntity: () => Envelope;
}

export function createDeviceClock(deps: DeviceClockDeps): DeviceClock {
  const nextUlid = createUlidFactory(deps.randomChunk);
  const hlc = createHlcClock(deps.deviceId, deps.initialHlc ?? null);

  /**
   * `now()` é chamado **uma vez** e o mesmo milissegundo alimenta o ULID e o HLC.
   * Chamar duas vezes daria um id de um instante e um relógio de outro, e as duas
   * ordenações do app — por `id` no desempate e por `hlc` no fold — deixariam de
   * coincidir.
   */
  function at(entityId: Ulid): Envelope {
    const millis = deps.now();
    return {
      eventId: nextUlid(millis),
      entityId,
      deviceId: deps.deviceId,
      hlc: hlc.tick(millis),
    };
  }

  return {
    deviceId: deps.deviceId,
    envelope: at,
    newEntity: () => at(nextUlid(deps.now())),
  };
}
