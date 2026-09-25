import "./landing.css";
import { currency, type DemoFrame, demoFrame, LOOP_MS, moneyParts, STILL_T } from "./demo";
import { applyLang, LANG_KEY, type Lang, pickLang } from "./i18n";
import { createInstallFlow, type InstallPromptEvent } from "./install";
import { detectPlatform, type Platform } from "./platform";

const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.2,.7,.2,1)";

/*
 * Storage so para lembrar o idioma. Referenciar `localStorage` ja lanca em aba
 * privada ou com cookies bloqueados; a pagina tem que funcionar igual sem ele.
 */
function readLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

function saveLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {}
}

// --- Plataforma ---------------------------------------------------------------

const platform: Platform = detectPlatform({
  userAgent: navigator.userAgent,
  maxTouchPoints: navigator.maxTouchPoints,
  coarse: window.matchMedia("(pointer: coarse)").matches,
});
root.dataset.platform = platform;

function markInstalled(): void {
  root.dataset.installed = "";
}

if (window.matchMedia("(display-mode: standalone)").matches) markInstalled();

// --- Demo do celular ---------------------------------------------------------------

const stage = document.querySelector<HTMLElement>("[data-demo]");
const q = <T extends Element = HTMLElement>(sel: string) => stage?.querySelector<T>(sel) ?? null;
const qa = <T extends Element = HTMLElement>(sel: string) => [
  ...(stage?.querySelectorAll<T>(sel) ?? []),
];

const demo = {
  screen: q("[data-d=screen]"),
  home: q("[data-d=home]"),
  wizard: q("[data-d=wizard]"),
  step: q("[data-d=step]"),
  segs: qa("[data-d=seg]"),
  chipType: q("[data-d=chip-type]"),
  chipAmount: q("[data-d=chip-amount]"),
  chipCat: q("[data-d=chip-cat]"),
  panels: qa("[data-d=panel]"),
  optExpense: q("[data-d=opt-expense]"),
  optFood: q("[data-d=opt-food]"),
  optToday: q("[data-d=opt-today]"),
  amount: q("[data-d=amount]"),
  caret: q("[data-d=caret]"),
  keys: qa("[data-key]"),
  taps: qa("[data-tap]"),
  save: q("[data-d=save]"),
  toast: q("[data-d=toast]"),
  newRow: q("[data-d=newrow]"),
  balInt: q("[data-d=bal-int]"),
  balDec: q("[data-d=bal-dec]"),
  spent: q("[data-d=spent]"),
  bar: q("[data-d=bar]"),
};

let lang: Lang = "en";
let lastT = STILL_T;

/** Aplica um quadro. So escreve no DOM; toda decisao ja veio pronta de demoFrame. */
function renderDemo(f: DemoFrame): void {
  demo.screen?.classList.toggle("on", f.screenVisible);
  demo.home?.classList.toggle("dim", f.wizardOpen);
  demo.wizard?.classList.toggle("open", f.wizardOpen);
  if (demo.step) demo.step.textContent = String(f.stepNumber);
  demo.segs.forEach((seg, i) => {
    seg.classList.toggle("on", f.step >= i + 1);
  });
  demo.chipType?.classList.toggle("on", f.chips.type);
  demo.chipAmount?.classList.toggle("on", f.chips.amount);
  demo.chipCat?.classList.toggle("on", f.chips.category);
  demo.panels.forEach((panel, i) => {
    const n = i + 1;
    panel.dataset.pos = f.step === n ? "cur" : f.step > n ? "prev" : "next";
  });
  demo.optExpense?.classList.toggle("sel", f.selected.expense);
  demo.optFood?.classList.toggle("sel", f.selected.food);
  demo.optToday?.classList.toggle("sel", f.selected.today);

  const typed = moneyParts(f.cents / 100, lang);
  if (demo.amount) {
    demo.amount.textContent = `${typed.int}${typed.dec}`;
    demo.amount.classList.toggle("empty", f.cents === 0);
  }
  demo.caret?.classList.toggle("off", !f.caretOn);
  for (const key of demo.keys) key.classList.toggle("pressed", key.dataset.key === f.pressedKey);
  for (const el of demo.taps) {
    const tap = f.taps[el.dataset.tap as keyof DemoFrame["taps"]];
    if (!tap) continue;
    el.style.opacity = tap.o.toFixed(2);
    el.style.transform = `scale(${tap.s.toFixed(3)})`;
  }
  demo.save?.classList.toggle("pressed", f.savePressed);
  demo.toast?.classList.toggle("on", f.toast);
  demo.newRow?.classList.toggle("on", f.newRow);

  const bal = moneyParts(f.balance, lang);
  if (demo.balInt) demo.balInt.textContent = bal.int;
  if (demo.balDec) demo.balDec.textContent = bal.dec;
  if (demo.spent) {
    const spent = moneyParts(f.spent, lang).int;
    demo.spent.textContent =
      lang === "pt" ? `${currency(lang)} ${spent} de 3.000` : `${currency(lang)}${spent} of 3,000`;
  }
  if (demo.bar) demo.bar.style.width = `${f.barPct.toFixed(2)}%`;
}

/*
 * Relogio da demo: 50ms por quadro, como no prototipo. So anda com o palco na
 * tela e a aba visivel — ninguem ve, ninguem paga bateria. O tempo parado nao
 * conta: ao voltar, a demo continua de onde estava em vez de pular.
 */
function startDemo(): void {
  if (!stage) return;
  if (reduceMotion) {
    renderDemo(demoFrame(STILL_T));
    return;
  }

  let visible = false;
  let raf = 0;
  let clock = 400;
  let prev = 0;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (prev === 0) prev = now;
    const dt = now - prev;
    if (dt < 50) return;
    prev = now;
    clock = (clock + Math.min(dt, 250)) % LOOP_MS;
    lastT = clock;
    renderDemo(demoFrame(clock));
  };

  const sync = () => {
    const run = visible && document.visibilityState === "visible";
    if (run && raf === 0) {
      prev = 0;
      raf = requestAnimationFrame(tick);
    } else if (!run && raf !== 0) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    sync();
  }).observe(stage);
  document.addEventListener("visibilitychange", sync);
  renderDemo(demoFrame(clock));
}

// --- Idioma ---------------------------------------------------------------------------

function setLang(next: Lang): void {
  lang = next;
  applyLang(document, next);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === next));
  }
  // Valores que o script monta (saldo, gasto, digitado) seguem o idioma na hora.
  renderDemo(demoFrame(lastT));
}

setLang(pickLang(readLang(), navigator.language));

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-lang]")) {
  button.addEventListener("click", () => {
    const next = button.dataset.lang === "pt" ? "pt" : "en";
    setLang(next);
    saveLang(next);
  });
}

startDemo();

// --- Perguntas: uma aberta por vez -------------------------------------------------

const questions = [...document.querySelectorAll<HTMLButtonElement>("[data-qa]")];
for (const button of questions) {
  button.addEventListener("click", () => {
    const opening = button.getAttribute("aria-expanded") !== "true";
    for (const other of questions) {
      const open = other === button && opening;
      other.setAttribute("aria-expanded", String(open));
      other.closest(".qa")?.classList.toggle("open", open);
    }
  });
}

// --- Movimento: entradas, risco, flutuacao, odometro -------------------------------

function animateIn(): void {
  if (reduceMotion) return;

  const reveals = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
  for (const el of reveals) {
    el.style.opacity = "0";
    el.style.transform = "translateY(22px)";
  }
  // Reflow antes de ligar a transicao: sem ele o estado inicial nao e pintado e
  // os elementos aparecem sem animar.
  void root.offsetWidth;
  for (const el of reveals) {
    const delay = `${el.dataset.reveal ?? 0}ms`;
    el.style.transition = `opacity .8s ${EASE} ${delay}, transform .8s ${EASE} ${delay}`;
  }
  const revealer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.style.opacity = "1";
        el.style.transform = "none";
        revealer.unobserve(el);
      }
    },
    { threshold: 0.12 },
  );
  for (const el of reveals) revealer.observe(el);

  const strike = document.querySelector<HTMLElement>("[data-strike]");
  const struck = document.querySelector<HTMLElement>("[data-strike-text]");
  const late = { duration: 700, delay: 1100, easing: EASE, fill: "backwards" } as const;
  strike?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], late);
  struck?.animate(
    [
      { color: "var(--color-fg)" },
      { color: "color-mix(in srgb, var(--color-fg) 38%, transparent)" },
    ],
    late,
  );

  const loop = { iterations: Number.POSITIVE_INFINITY, direction: "alternate" } as const;
  document
    .querySelector("[data-float]")
    ?.animate([{ transform: "translateY(0)" }, { transform: "translateY(-10px)" }], {
      ...loop,
      duration: 4200,
      easing: "ease-in-out",
    });
  document.querySelector("[data-glow]")?.animate(
    [
      { opacity: 0.7, transform: "translateX(-50%) scale(.95)" },
      { opacity: 1, transform: "translateX(-50%) scale(1.06)" },
    ],
    { ...loop, duration: 3600, easing: "ease-in-out" },
  );
  document.querySelector("[data-pulse]")?.animate([{ opacity: 1 }, { opacity: 0.25 }], {
    ...loop,
    duration: 900,
    easing: "ease-in-out",
  });

  // Odometros: comecam no 9 e rolam ate o 0 quando a faixa aparece.
  const rolls = [...document.querySelectorAll<HTMLElement>("[data-roll]")];
  const band = document.querySelector("[data-rolls]");
  if (!band) return;
  for (const roll of rolls) roll.style.transform = "translateY(0)";
  const roller = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      roller.disconnect();
      for (const roll of rolls) {
        roll.animate([{ transform: "translateY(0)" }, { transform: "translateY(-90%)" }], {
          duration: 1400,
          delay: 300 + Number(roll.dataset.roll ?? 0),
          easing: "cubic-bezier(.3,.9,.2,1)",
          fill: "forwards",
        });
      }
    },
    { threshold: 0.4 },
  );
  roller.observe(band);
}

animateIn();

// --- Instalacao -----------------------------------------------------------------------

const flow = createInstallFlow();

window.addEventListener("beforeinstallprompt", (event) => {
  flow.capture(event as InstallPromptEvent);
});
window.addEventListener("appinstalled", markInstalled);

const sheet = document.getElementById("donate") as HTMLDialogElement | null;

function openSheet(view: "donate" | "steps"): void {
  if (!sheet) return;
  sheet.dataset.view = view;
  if (!sheet.open) sheet.showModal();
}

async function installNow(): Promise<void> {
  const result = await flow.install();
  if (result === "accepted") {
    markInstalled();
    sheet?.close();
  } else if (result === "dismissed") {
    sheet?.close();
  } else {
    // Sem prompt (iPhone, Firefox, prompt ja usado): a folha vira o passo a passo.
    openSheet("steps");
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-install]")) {
  button.addEventListener("click", () => {
    // Sem <dialog> (navegador muito velho), a doacao sai do caminho: instalar
    // nunca depende de ver o convite.
    if (sheet && typeof sheet.showModal === "function") openSheet("donate");
    else void installNow();
  });
}

document.querySelector("[data-install-now]")?.addEventListener("click", () => {
  // O prompt() precisa deste clique como gesto do usuario: nada de await antes.
  void installNow();
});

for (const button of sheet?.querySelectorAll("[data-close]") ?? []) {
  button.addEventListener("click", () => sheet?.close());
}

// Toque no fundo escurecido fecha. O ::backdrop nao e elemento: o clique nele
// chega com alvo no proprio <dialog> — mas o padding da folha tambem. So a
// posicao fora do retangulo separa um do outro.
sheet?.addEventListener("click", (event) => {
  if (event.target !== sheet) return;
  const r = sheet.getBoundingClientRect();
  const inside =
    event.clientX >= r.left &&
    event.clientX <= r.right &&
    event.clientY >= r.top &&
    event.clientY <= r.bottom;
  if (!inside) sheet.close();
});
