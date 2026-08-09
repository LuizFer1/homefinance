import {
  Baby,
  Banknote,
  Book,
  Briefcase,
  Bus,
  Car,
  CircleDashed,
  Coffee,
  CreditCard,
  Dog,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Music,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  Utensils,
  Wallet,
  Wifi,
  Zap,
} from "lucide-preact";

/**
 * Imports **literais**, num `Record` estático.
 *
 * Literal é o que preserva o tree-shaking: `import()` dinâmico traria a
 * biblioteca inteira e estouraria o teto de bundle sozinho. A escolha do usuário
 * é lookup neste mapa, nunca import em runtime.
 *
 * Custo medido destes 34 ícones: 4.88kb gzip, contra o gatilho de reversão de
 * 10kb registrado no ROADMAP. Acrescentar ícones aqui é barato, mas não é de
 * graça — remeça a medição se a lista crescer muito.
 */
export const ICON_SET = {
  baby: Baby,
  banknote: Banknote,
  book: Book,
  briefcase: Briefcase,
  bus: Bus,
  car: Car,
  coffee: Coffee,
  "credit-card": CreditCard,
  dog: Dog,
  dumbbell: Dumbbell,
  film: Film,
  fuel: Fuel,
  gamepad: Gamepad2,
  gift: Gift,
  graduation: GraduationCap,
  health: HeartPulse,
  house: House,
  landmark: Landmark,
  music: Music,
  "piggy-bank": PiggyBank,
  pill: Pill,
  plane: Plane,
  receipt: Receipt,
  scissors: Scissors,
  shirt: Shirt,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  smartphone: Smartphone,
  tag: Tag,
  utensils: Utensils,
  wallet: Wallet,
  wifi: Wifi,
  zap: Zap,
} as const;

export type IconKey = keyof typeof ICON_SET;

/**
 * Chave desconhecida cai aqui em vez de não renderizar nada. O log é eterno e um
 * aparelho de versão mais nova pode gravar uma chave que esta versão não conhece.
 */
export const FALLBACK_ICON = CircleDashed;

export const ICON_KEYS = Object.keys(ICON_SET) as IconKey[];
