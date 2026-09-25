export type Lang = "en" | "pt";

/** Mesmo prefixo `hf:` das outras preferencias do app nesta origem. */
export const LANG_KEY = "hf:lang";

const en = {
  "nav.statement": "Statement",
  "nav.benefits": "What you get",
  "nav.faq": "Questions",

  "hero.no1": "No account",
  "hero.no2": "No email",
  "hero.no3": "No spam",
  "hero.t1": "Your money.",
  "hero.t2": "Your phone.",
  "hero.t3": "Your email",
  "hero.t4": "is nobody's",
  "hero.t5": "business.",
  "hero.lead":
    "A personal finance app that works offline and keeps every number on your device. Nothing to sign up for.",

  "cta.install": "Install app",
  "cta.installMeta": "Free · Android and iPhone",
  "cta.open": "Open app",
  "cta.browser": "Use in the browser",
  "qr.title": "Point your camera",
  "qr.text":
    "Open it on your phone and tap “Add to Home Screen”. There's nothing to install on a computer.",
  "qr.alt": "QR code for luizfer1.github.io/homefinance",

  "demo.live": "Live demo",
  "demo.path": "Home → New entry → Saved",
  "demo.greeting": "Good afternoon, Luiz",
  "demo.month": "This month",
  "demo.cur": "$",
  "demo.trend": "+$340 vs. August",
  "demo.spentLabel": "Spent this month",
  "demo.today": "Today",
  "demo.food": "Food",
  "demo.foodMeta": "Luiz · now",
  "demo.foodValue": "−$38.90",
  "demo.salary": "Salary",
  "demo.salaryMeta": "Luiz · Account",
  "demo.salaryValue": "+$5,200",
  "demo.groceries": "Groceries",
  "demo.groceriesMeta": "Ana · Credit",
  "demo.groceriesValue": "−$412",
  "demo.rent": "Rent",
  "demo.rentMeta": "Luiz · Debit",
  "demo.rentValue": "−$1,800",
  "demo.newEntry": "New entry",
  "demo.of4": "of 4",
  "demo.expense": "Expense",
  "demo.income": "Income",
  "demo.transfer": "Transfer",
  "demo.amountValue": "$38.90",
  "demo.what": "What was it?",
  "demo.howMuch": "How much?",
  "demo.decimalKey": ".",
  "demo.continue": "Continue",
  "demo.category": "Category",
  "demo.transport": "Transport",
  "demo.housing": "Housing",
  "demo.leisure": "Leisure",
  "demo.health": "Health",
  "demo.shopping": "Shopping",
  "demo.when": "When?",
  "demo.yesterday": "Yesterday",
  "demo.otherDate": "Other date",
  "demo.type": "Type",
  "demo.amount": "Amount",
  "demo.who": "Who",
  "demo.save": "Save",
  "demo.saved": "Entry saved",

  "stmt.eyebrow": "01 · Statement",
  "stmt.title": "What HomeFinance asks of you",
  "stmt.accounts": "Accounts created",
  "stmt.emails": "Emails requested",
  "stmt.passwords": "Passwords",
  "stmt.servers": "Servers",
  "stmt.trackers": "Trackers",
  "stmt.cost": "Cost per month",
  "stmt.dec": ".00",

  "feat.title": "What you get",
  "feat.account": "No account, ever",
  "feat.accountText": "Open it and start. No email, no password, no “verify your address”.",
  "feat.offline": "Works offline",
  "feat.offlineText": "No signal at the supermarket? Doesn't matter.",
  "feat.data": "Your data stays here",
  "feat.dataText": "No server, no tracking, no analytics.",
  "feat.light": "Light and fast",
  "feat.lightText": "Installs in seconds and opens instantly.",

  "story.eyebrow": "Why I built it",
  "story.by": "the developer",
  "story.quote":
    "“I got tired of creating an account for everything and watching my inbox turn into a spam dump. So I built a finance app that just…",
  "story.punch": "doesn't ask.",

  "faq.title": "Questions",
  "faq.more": "Another question? Open an issue on",
  "faq.freeQ": "Is it really free?",
  "faq.freeA":
    "Yes. No paid plan, no ads, no “Pro version”. If you'd like to support it, there's a coffee button down below.",
  "faq.lostQ": "What if I lose my phone?",
  "faq.lostA":
    "Your data only exists on your phone, so it goes with it. Backup and export are on the way.",
  "faq.storeQ": "Why isn't it in the app stores?",
  "faq.storeA":
    "It's an installable web app: it opens in the browser and goes to your home screen like any other. No store, no store account, no middleman.",
  "faq.twoQ": "Can I use it on two phones?",
  "faq.twoA":
    "Not yet. A sync hub is on the way: a program that runs on your own computer, never on someone else's server.",

  "foot.made": "Made by someone tired of spam",
  "foot.coffee": "Support me on Ko-fi",
  "foot.source": "Source on GitHub",

  "sheet.title": "Before you install…",
  "sheet.body":
    "Like the idea of an app with no account and no spam? It's free and will stay that way. If you'd like to help, a coffee keeps the project going.",
  "sheet.coffee": "Support me on Ko-fi",
  "sheet.install": "Install without donating",
  "sheet.note": "Donating is optional. Installing never depends on it.",
  "sheet.close": "Close",
  "sheet.stepsTitle": "Install from the browser menu",
  "sheet.done": "Got it",
  "steps.android1": "Open this page in Chrome",
  "steps.android2": "Tap the ⋮ menu",
  "steps.android3": "Tap “Install app” (or “Add to Home screen”)",
  "steps.ios1": "Open this page in Safari",
  "steps.ios2": "Tap Share",
  "steps.ios3": "Tap “Add to Home Screen”",
} as const;

export type MessageKey = keyof typeof en;

const pt: Record<MessageKey, string> = {
  "nav.statement": "Extrato",
  "nav.benefits": "O que você ganha",
  "nav.faq": "Perguntas",

  "hero.no1": "Sem conta",
  "hero.no2": "Sem e-mail",
  "hero.no3": "Sem spam",
  "hero.t1": "Seu dinheiro.",
  "hero.t2": "Seu celular.",
  "hero.t3": "Seu e-mail",
  "hero.t4": "não é da conta de",
  "hero.t5": "ninguém.",
  "hero.lead":
    "Um app de finanças pessoais que funciona offline e guarda cada número no seu aparelho. Nada para cadastrar.",

  "cta.install": "Instalar app",
  "cta.installMeta": "Grátis · Android e iPhone",
  "cta.open": "Abrir o app",
  "cta.browser": "Usar no navegador",
  "qr.title": "Aponte a câmera",
  "qr.text":
    "Abra no celular e toque em “Adicionar à tela inicial”. Não há o que instalar no computador.",
  "qr.alt": "QR code para luizfer1.github.io/homefinance",

  "demo.live": "Demonstração ao vivo",
  "demo.path": "Início → Novo lançamento → Salvo",
  "demo.greeting": "Boa tarde, Luiz",
  "demo.month": "Este mês",
  "demo.cur": "R$",
  "demo.trend": "+R$ 340 vs. agosto",
  "demo.spentLabel": "Gasto do mês",
  "demo.today": "Hoje",
  "demo.food": "Alimentação",
  "demo.foodMeta": "Luiz · agora",
  "demo.foodValue": "−R$ 38,90",
  "demo.salary": "Salário",
  "demo.salaryMeta": "Luiz · Conta",
  "demo.salaryValue": "+R$ 5.200",
  "demo.groceries": "Mercado",
  "demo.groceriesMeta": "Ana · Crédito",
  "demo.groceriesValue": "−R$ 412",
  "demo.rent": "Aluguel",
  "demo.rentMeta": "Luiz · Pix",
  "demo.rentValue": "−R$ 1.800",
  "demo.newEntry": "Novo lançamento",
  "demo.of4": "de 4",
  "demo.expense": "Despesa",
  "demo.income": "Receita",
  "demo.transfer": "Transferência",
  "demo.amountValue": "R$ 38,90",
  "demo.what": "O que foi?",
  "demo.howMuch": "Quanto?",
  "demo.decimalKey": ",",
  "demo.continue": "Continuar",
  "demo.category": "Categoria",
  "demo.transport": "Transporte",
  "demo.housing": "Moradia",
  "demo.leisure": "Lazer",
  "demo.health": "Saúde",
  "demo.shopping": "Compras",
  "demo.when": "Quando?",
  "demo.yesterday": "Ontem",
  "demo.otherDate": "Outra data",
  "demo.type": "Tipo",
  "demo.amount": "Valor",
  "demo.who": "Quem",
  "demo.save": "Salvar",
  "demo.saved": "Lançamento salvo",

  "stmt.eyebrow": "01 · Extrato",
  "stmt.title": "O que o HomeFinance pede de você",
  "stmt.accounts": "Contas criadas",
  "stmt.emails": "E-mails pedidos",
  "stmt.passwords": "Senhas",
  "stmt.servers": "Servidores",
  "stmt.trackers": "Rastreadores",
  "stmt.cost": "Custo por mês",
  "stmt.dec": ",00",

  "feat.title": "O que você ganha",
  "feat.account": "Sem conta, nunca",
  "feat.accountText": "Abra e comece. Sem e-mail, sem senha, sem “confirme seu endereço”.",
  "feat.offline": "Funciona offline",
  "feat.offlineText": "Sem sinal no mercado? Não faz diferença.",
  "feat.data": "Seus dados ficam aqui",
  "feat.dataText": "Sem servidor, sem rastreio, sem analytics.",
  "feat.light": "Leve e rápido",
  "feat.lightText": "Instala em segundos e abre na hora.",

  "story.eyebrow": "Por que eu fiz isso",
  "story.by": "o desenvolvedor",
  "story.quote":
    "“Cansei de criar conta para tudo e ver minha caixa de e-mail virar depósito de spam. Então fiz um app de finanças que simplesmente…",
  "story.punch": "não pede.",

  "faq.title": "Perguntas",
  "faq.more": "Outra dúvida? Abra uma issue no",
  "faq.freeQ": "É grátis mesmo?",
  "faq.freeA":
    "Sim. Sem plano pago, sem anúncio, sem “versão Pro”. Se quiser apoiar, tem o botão do café lá embaixo.",
  "faq.lostQ": "E se eu perder o celular?",
  "faq.lostA":
    "Como os dados só existem no aparelho, eles vão junto. Backup e exportação estão a caminho.",
  "faq.storeQ": "Por que não está na loja de apps?",
  "faq.storeA":
    "É um app web instalável: abre pelo navegador e vai para a tela inicial como qualquer outro. Sem loja, sem conta de loja, sem intermediário.",
  "faq.twoQ": "Posso usar em dois celulares?",
  "faq.twoA":
    "Ainda não. Está a caminho um hub de sincronização — um programa que roda no seu computador, nunca num servidor de terceiros.",

  "foot.made": "Feito por alguém cansado de spam",
  "foot.coffee": "Me apoie no Ko-fi",
  "foot.source": "Código no GitHub",

  "sheet.title": "Antes de instalar…",
  "sheet.body":
    "Gostou da ideia de um app sem conta e sem spam? Ele é gratuito e vai continuar assim. Se quiser ajudar, um café mantém o projeto andando.",
  "sheet.coffee": "Me apoie no Ko-fi",
  "sheet.install": "Instalar sem doar",
  "sheet.note": "Doar é opcional. A instalação nunca depende disso.",
  "sheet.close": "Fechar",
  "sheet.stepsTitle": "Instale pelo menu do navegador",
  "sheet.done": "Entendi",
  "steps.android1": "Abra esta página no Chrome",
  "steps.android2": "Toque no menu ⋮",
  "steps.android3": "Toque em “Instalar app” (ou “Adicionar à tela inicial”)",
  "steps.ios1": "Abra esta página no Safari",
  "steps.ios2": "Toque em Compartilhar",
  "steps.ios3": "Toque em “Adicionar à Tela de Início”",
};

export const messages: Record<Lang, Record<MessageKey, string>> = { en, pt };

export function isMessageKey(key: string): key is MessageKey {
  return key in en;
}

/**
 * Escolha salva vence; depois o idioma do navegador; ingles e o padrao. So
 * "pt*" vira portugues — um navegador em espanhol le melhor ingles do que
 * portugues de Portugal fingindo ser neutro.
 */
export function pickLang(stored: string | null, browserLang: string | undefined): Lang {
  if (stored === "en" || stored === "pt") return stored;
  return browserLang?.toLowerCase().startsWith("pt") ? "pt" : "en";
}

/**
 * Troca o texto de todo elemento marcado. `data-i18n` troca o conteudo,
 * `data-i18n-label` o `aria-label`, `data-i18n-alt` o `alt`. So texto puro —
 * nunca innerHTML, entao nada aqui vira marcacao.
 */
export function applyLang(root: Document, lang: Lang): void {
  const dict = messages[lang];
  root.documentElement.lang = lang === "pt" ? "pt-BR" : "en";

  const swap = (attr: string, write: (el: Element, text: string) => void) => {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const key = el.getAttribute(attr);
      if (key && isMessageKey(key)) write(el, dict[key]);
    }
  };
  swap("data-i18n", (el, text) => {
    el.textContent = text;
  });
  swap("data-i18n-label", (el, text) => {
    el.setAttribute("aria-label", text);
  });
  swap("data-i18n-alt", (el, text) => {
    el.setAttribute("alt", text);
  });
}
