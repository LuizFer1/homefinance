import { useEffect, useState } from "preact/hooks";
import { ignoreHandled } from "../session/session";
import { Button } from "../ui/button";
import { FIELD_PAGE, HINT, LABEL } from "../ui/field";
import { PageHeader } from "../ui/page-header";
import { addressProblem, caGuideUrl, normalizeAddress, normalizeToken } from "./address";
import type { HubDeepLink } from "./deep-link";
import { describeHubStatus } from "./status";
import type { SyncStore } from "./store";

export interface HubPageProps {
  sync: SyncStore;
  /** Sugestão para "Nome deste aparelho" (`guessDeviceName`). */
  deviceNameGuess: string;
  onBack: () => void;
}

const ALERT = "mt-4 rounded-lg bg-expense/10 p-3 text-sm text-expense-fg";
const LINK = "text-accent-300 underline underline-offset-2";

function GuideLink({ address }: { address: string }) {
  return (
    <a href={caGuideUrl(address)} target="_blank" rel="noreferrer" class={LINK}>
      Abrir o guia do certificado
    </a>
  );
}

function PairForm({
  sync,
  initial,
  deviceNameGuess,
}: {
  sync: SyncStore;
  initial: HubDeepLink | null;
  deviceNameGuess: string;
}) {
  const current = sync.link.value;
  const [address, setAddress] = useState(initial?.address ?? current?.address ?? "");
  const [token, setToken] = useState(initial?.token ?? "");
  const [deviceName, setDeviceName] = useState(current?.deviceName || deviceNameGuess);
  const [problem, setProblem] = useState<string | null>(null);

  const normalizedAddress = normalizeAddress(address);
  // Campo vazio não é erro ainda; preenchido e recusado, a pessoa precisa saber por quê.
  const addressHint = address.trim() === "" ? null : addressProblem(address);
  const normalizedToken = normalizeToken(token);
  const name = deviceName.trim();
  const valid =
    normalizedAddress !== null && normalizedToken !== null && name.length > 0 && name.length <= 64;
  const busy = sync.status.value === "pairing";
  const unreachable = sync.lastError.value?.kind === "unreachable";

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (normalizedAddress === null || normalizedToken === null || !valid) return;
    setProblem(null);
    try {
      await sync.pair({ address: normalizedAddress, token: normalizedToken, deviceName: name });
    } catch {
      // A mensagem traduzida já está em `lastError`; a exceção só sinaliza a falha.
      setProblem(sync.lastError.value?.message ?? "Não foi possível parear.");
    }
  }

  return (
    <form onSubmit={handleSubmit} class="mt-5">
      <label class={LABEL} for="hub-address">
        Endereço do hub
      </label>
      <input
        id="hub-address"
        name="hub-address"
        type="text"
        inputMode="url"
        autocomplete="off"
        autocapitalize="off"
        placeholder="192.168.0.5:7777"
        class={`${FIELD_PAGE} mt-2`}
        value={address}
        onInput={(event) => setAddress(event.currentTarget.value)}
      />
      {addressHint !== null && <p class={`${HINT} text-expense-fg`}>{addressHint}</p>}

      <label class={`${LABEL} mt-4`} for="hub-token">
        Código
      </label>
      <input
        id="hub-token"
        name="hub-token"
        type="text"
        autocomplete="one-time-code"
        autocapitalize="characters"
        placeholder="ABC-DEF"
        class={`${FIELD_PAGE} mt-2`}
        value={token}
        onInput={(event) => setToken(event.currentTarget.value)}
      />
      <p class={HINT}>Aparece na janela do hub ao lado do QR code. Vale cinco minutos.</p>

      <label class={`${LABEL} mt-4`} for="hub-device">
        Nome deste aparelho
      </label>
      <input
        id="hub-device"
        name="hub-device"
        type="text"
        maxLength={64}
        autocomplete="off"
        class={`${FIELD_PAGE} mt-2`}
        value={deviceName}
        onInput={(event) => setDeviceName(event.currentTarget.value)}
      />

      <Button type="submit" icon="check" class="mt-5 w-full" disabled={!valid || busy}>
        {busy ? "Pareando…" : "Parear"}
      </Button>

      {problem !== null && (
        <p role="alert" class={ALERT}>
          {problem}
          {unreachable && normalizedAddress !== null && (
            <>
              {" "}
              <GuideLink address={normalizedAddress} />
            </>
          )}
        </p>
      )}

      <details class="mt-5">
        <summary class="hf-label cursor-pointer">Antes de parear</summary>
        <ol class="mt-2 list-decimal space-y-2 pl-5 text-[13px] leading-snug text-fg/70">
          <li>Conecte este celular no mesmo Wi-Fi do computador onde o hub está aberto.</li>
          <li>
            Instale o certificado do hub uma vez.{" "}
            {normalizedAddress === null ? (
              "Digite o endereço acima para ver o guia."
            ) : (
              <GuideLink address={normalizedAddress} />
            )}
          </li>
          <li>
            O navegador pode pedir permissão para acessar dispositivos na sua rede local. É a
            conexão com o seu computador — aceite.
          </li>
        </ol>
      </details>
    </form>
  );
}

function PairedCard({ sync }: { sync: SyncStore }) {
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const link = sync.link.value;
  const syncing = sync.status.value === "syncing";
  const summary = sync.lastSummary.value;
  if (link === null) return null;

  async function handleSync() {
    setProblem(null);
    try {
      await sync.sync();
    } catch {
      setProblem(sync.lastError.value?.message ?? "Não foi possível sincronizar.");
    }
  }

  const rejected = summary?.rejected.length ?? 0;
  const invalid = summary?.invalid ?? 0;

  return (
    <div class="mt-5">
      <div class="rounded-lg bg-surface p-4">
        <p class="text-[15px] font-medium">{link.name}</p>
        <p class="hf-num mt-0.5 text-sm text-fg/55">{link.address}</p>
        <p class="mt-0.5 text-sm text-fg/55">Este aparelho: {link.deviceName}</p>
        <p role="status" class="mt-3 text-[13px] text-fg/70">
          {describeHubStatus({
            link,
            status: sync.status.value,
            revoked: sync.revoked.value,
            lastError: sync.lastError.value,
            lastSyncAt: sync.lastSyncAt.value,
          })}
        </p>
        {summary !== null && (
          <p class="mt-1 text-[13px] text-fg/55">
            Enviados {summary.pushed} · Recebidos {summary.pulled}
            {rejected > 0 && (
              <span class="text-expense-fg">
                {" "}
                · {rejected} {rejected === 1 ? "recusada" : "recusadas"} pelo hub
              </span>
            )}
            {invalid > 0 && (
              <span class="text-expense-fg">
                {" "}
                · {invalid} {invalid === 1 ? "ignorada" : "ignoradas"}
              </span>
            )}
          </p>
        )}
      </div>

      <Button icon="arrows-clockwise" class="mt-4 w-full" disabled={syncing} onClick={handleSync}>
        {syncing ? "Sincronizando…" : "Sincronizar agora"}
      </Button>

      {problem !== null && (
        <p role="alert" class={ALERT}>
          {problem}
        </p>
      )}

      {confirming ? (
        <div class="mt-4">
          <p class={HINT}>Os seus dados ficam no celular. O hub continua com o que já recebeu.</p>
          <div class="mt-3 flex gap-3">
            <Button variant="secondary" class="flex-1" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              class="flex-1 border-expense text-expense-fg"
              onClick={() => void sync.unpair().catch(ignoreHandled)}
            >
              Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          class="mt-3 w-full"
          disabled={syncing}
          onClick={() => setConfirming(true)}
        >
          Desconectar deste aparelho
        </Button>
      )}
    </div>
  );
}

/**
 * Sub-tela de Ajustes, e não sheet: três estados, um formulário e a orientação
 * de certificado e permissão de rede não cabem num bottom sheet, e o deep link
 * do QR precisa de um destino para abrir.
 */
export function HubPage({ sync, deviceNameGuess, onBack }: HubPageProps) {
  // O deep link é consumido uma vez: montou com ele preenchido, não precisa
  // dele de novo — e um token na signal depois disso só poderia vazar.
  const [initial] = useState(() => sync.pendingDeepLink.value);
  useEffect(() => {
    sync.pendingDeepLink.value = null;
  }, [sync]);

  const link = sync.link.value;
  const revoked = sync.revoked.value;

  return (
    <section aria-label="Hub de sincronização">
      <PageHeader title="Hub" onBack={onBack} />

      {link === null || revoked ? (
        <>
          {revoked ? (
            <p role="alert" class={ALERT}>
              Este aparelho foi removido do hub. Pareie de novo para voltar a sincronizar.
            </p>
          ) : (
            <p class="mt-4 text-[15px] leading-normal text-fg/70 text-pretty">
              O hub é um programa que roda no seu computador e passa os lançamentos de um celular
              para o outro pela rede de casa. Nada passa pela internet.
            </p>
          )}
          <PairForm sync={sync} initial={initial} deviceNameGuess={deviceNameGuess} />
          {revoked && (
            <button
              type="button"
              class={`hf-press mt-5 text-sm text-fg/55 ${LINK}`}
              onClick={() => void sync.unpair().catch(ignoreHandled)}
            >
              Esquecer este hub
            </button>
          )}
        </>
      ) : (
        <PairedCard sync={sync} />
      )}
    </section>
  );
}
