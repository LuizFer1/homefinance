import { useState } from "preact/hooks";
import type { ColorToken } from "../../domain/model/tokens";
import type { UserDraft } from "../../domain/model/user";
import { BrandMark } from "../brand/brand-mark";
import { colorName, cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";
import { Avatar, MiniAvatar } from "../profile/avatar-view";
import { describeError } from "../session/session";
import { Button, SECONDARY } from "../ui/button";
import { HINT, LABEL } from "../ui/field";
import { MINUS } from "../ui/money";
import { Progress } from "../ui/progress";
import { Swatches } from "../ui/swatches";
import { IconTile } from "../ui/tile";

export interface OnboardingWizardProps {
  onComplete: (draft: UserDraft) => Promise<void> | void;
  /** Pipeline da foto, injetado: `happy-dom` não tem canvas. */
  processFile: (file: Blob) => Promise<string>;
}

const STEPS = ["Nome", "Cor", "Foto"] as const;

/** Título em duas linhas por etapa, como no handoff. */
const TITLES = [
  ["Bem-vindo ao", "HomeFinance"],
  ["Escolha", "sua cor"],
  ["Uma foto,", "se quiser"],
] as const;

const SUPPORT = [
  "Vamos começar pelo básico. Leva menos de um minuto.",
  "Ela marca os lançamentos que você criar — útil quando o app for compartilhado.",
  "Opcional. Sem foto, usamos sua inicial sobre a cor escolhida.",
] as const;

/**
 * Boas-vindas em três decisões: nome, cor, foto.
 *
 * Bloqueia o app enquanto não concluído — não há tela por trás dele que faça
 * sentido sem um autor. A **foto é a única etapa pulável**: exigi-la contraria
 * "nenhuma conta obrigatória" do README. Sem foto, o avatar é a inicial sobre a
 * cor escolhida, e isso é um estado final legítimo, não degradação.
 *
 * As ações ficam presas embaixo, ao alcance do polegar: a coluna ocupa a altura
 * da tela e o rodapé é empurrado para o fim dela.
 */
export function OnboardingWizard({ onComplete, processFile }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [name, setName] = useState("");
  const [color, setColor] = useState<ColorToken>("slate");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const nameValid = trimmed !== "";
  // Cor já nasce com um padrão e a foto é opcional, então só o nome bloqueia.
  const maxReachable = nameValid ? STEPS.length - 1 : 0;
  const isLast = step === STEPS.length - 1;

  function validateName(): boolean {
    if (!nameValid) {
      setProblem("Informe seu nome.");
      return false;
    }
    setProblem(null);
    return true;
  }

  function goTo(index: number) {
    if (step === 0 && index > 0 && !validateName()) return;
    setProblem(null);
    setDir(index < step ? "back" : "next");
    setStep(index);
  }

  async function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;

    try {
      setAvatar(await processFile(file));
      setProblem(null);
    } catch (cause) {
      // A foto anterior fica: uma tentativa falha não pode apagar o que já valia.
      setProblem(describeError(cause));
    } finally {
      // Sem isto, escolher o mesmo arquivo de novo não dispara `change`.
      input.value = "";
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (!validateName()) {
      setStep(0);
      return;
    }

    setSaving(true);
    try {
      await onComplete({ name: trimmed, color, avatar });
    } catch (cause) {
      // Erro mantém o wizard na tela: avançar deixaria o usuário num app sem
      // perfil, e o lote atômico garante que nada foi gravado pela metade.
      setProblem(describeError(cause));
    } finally {
      setSaving(false);
    }
  }

  const [lineA, lineB] = TITLES[step] ?? TITLES[0];

  return (
    <form
      onSubmit={handleSubmit}
      class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6
        pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))]"
    >
      <BrandMark size={44} />

      <div class="mt-10">
        <Progress
          steps={STEPS}
          current={step}
          maxReachable={maxReachable}
          onGo={goTo}
          variant="count"
        />
      </div>

      <div key={step} data-dir={dir} class="hf-step">
        <h1 class="mt-[22px] text-[34px] leading-[1.08] font-medium tracking-[-0.025em]">
          {lineA}
          <br />
          {lineB}
        </h1>
        <p class="mt-3 text-[15px] leading-normal text-fg/62 text-pretty">{SUPPORT[step]}</p>

        {step === 0 && (
          <div class="mt-8">
            <label class={LABEL} for="onboarding-name">
              Seu nome
            </label>
            <input
              id="onboarding-name"
              name="name"
              type="text"
              autocomplete="off"
              placeholder="Como te chamamos?"
              class="mt-2 h-14 w-full rounded-lg border border-divider bg-surface px-4 text-xl
                outline-none placeholder:text-fg/35 focus:border-accent focus-visible:outline-none"
              value={name}
              onInput={(event) => setName(event.currentTarget.value)}
            />
            <p class={HINT}>Aparece na saudação e nos seus lançamentos.</p>
          </div>
        )}

        {step === 1 && (
          <div class="mt-8">
            <Swatches
              name="color"
              legend="Sua cor"
              value={color}
              onChange={setColor}
              surface="bg"
            />

            {/*
              Prévia ao vivo: a cor só faz sentido onde ela vai aparecer — no
              mini-avatar de cada lançamento.
            */}
            <p class={`${LABEL} mt-8`}>Prévia</p>
            <div class="mt-2 flex h-16 items-center gap-3 rounded-lg bg-surface px-3.5">
              <IconTile icon="utensils" color="orange" size={38} iconSize={19} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">Mercado</span>
                <span class="mt-1 flex items-center gap-1.5 text-xs text-fg/55">
                  <MiniAvatar name={trimmed} color={color} />
                  {trimmed} · Alimentação
                </span>
              </span>
              <span class="hf-num text-[15px] font-medium">{MINUS}R$ 254,30</span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div class="mt-8">
            <div class="flex items-center gap-5">
              <span
                class="relative shrink-0 rounded-full"
                style={{
                  boxShadow: `0 0 0 4px var(--color-bg), 0 0 0 5px ${cssVarForToken(color)}`,
                }}
              >
                <Avatar name={trimmed} color={color} avatar={avatar} size={112} />
                <span
                  aria-hidden="true"
                  class="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full
                    bg-surface text-fg/85 shadow-[0_0_0_3px_var(--color-bg)]"
                >
                  <Icon name="camera" size={18} />
                </span>
              </span>
              <span class="min-w-0">
                <span class="block truncate text-xl font-medium">{trimmed}</span>
                <span class="mt-1 flex items-center gap-1.5 text-[13px] text-fg/60">
                  <span
                    aria-hidden="true"
                    class="size-2 rounded-full"
                    style={{ backgroundColor: cssVarForToken(color) }}
                  />
                  {colorName(color)}
                </span>
              </span>
            </div>

            <div class="mt-7 flex flex-wrap gap-2.5">
              <label
                class={`${SECONDARY} flex-1 cursor-pointer has-[:focus-visible]:outline-2
                  has-[:focus-visible]:outline-accent`}
              >
                <Icon name="image" size={18} />
                {avatar === null ? "Escolher foto" : "Trocar foto"}
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Escolher foto"
                  onChange={handleFile}
                  class="sr-only"
                />
              </label>
              {avatar !== null && (
                <Button variant="secondary" onClick={() => setAvatar(null)}>
                  Remover foto
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {problem !== null && (
        <p role="alert" class="mt-5 text-[15px] text-expense-fg">
          {problem}
        </p>
      )}

      {/*
        As `key` distintas não são decoração — ver o comentário gêmeo em
        `transaction-wizard.tsx`. Sem elas, ir da cor para a foto concluía o
        cadastro na hora: a etapa da foto nunca chegava a aparecer.
      */}
      <div class="mt-auto pt-8">
        {/* Perto do botão, e não do campo: é a última coisa lida antes de continuar. */}
        {step === 0 && (
          <div class="mb-4 flex items-start gap-3 rounded-lg bg-surface p-4">
            <Icon name="lock-simple" size={18} class="mt-0.5 text-accent-300" />
            <p class="text-[13px] leading-normal text-fg/70">
              Seus dados ficam neste aparelho. Sem conta, sem cadastro, sem internet.
            </p>
          </div>
        )}
        <div class="flex gap-2.5">
          {step > 0 && (
            <Button key="voltar" variant="secondary" onClick={() => goTo(step - 1)}>
              Voltar
            </Button>
          )}
          {isLast ? (
            <Button key="enviar" type="submit" icon="check" disabled={saving} class="flex-1">
              {saving ? "Salvando..." : "Começar"}
            </Button>
          ) : (
            <Button
              key="avancar"
              icon="arrow-right"
              // Parece desabilitado sem nome, mas continua clicável: o toque é o
              // que mostra o motivo, e um botão morto não explica nada.
              aria-disabled={step === 0 && !nameValid}
              class={`flex-1 ${step === 0 && !nameValid ? "opacity-45" : ""}`}
              onClick={() => goTo(step + 1)}
            >
              Continuar
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
