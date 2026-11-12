import { ASSET_KINDS, type AssetKind } from "../../domain/model/asset";

export interface AssetKindMeta {
  label: string;
  /** Plural, para o título do grupo na lista. */
  plural: string;
  /** Glifo Phosphor da interface e token de cor da paleta (nunca hex). */
  icon: string;
  color: string;
}

const KIND_META: Record<AssetKind, AssetKindMeta> = {
  investment: {
    label: "Investimento",
    plural: "Investimentos",
    icon: "trend-up",
    color: "emerald",
  },
  inventory: { label: "Estoque", plural: "Estoque", icon: "shopping-bag", color: "amber" },
  equipment: { label: "Equipamento", plural: "Equipamentos", icon: "laptop", color: "sky" },
};

/** Tipo que só uma versão futura conhece (chegando por sync): aparece neutro, nunca derruba a tela. */
const UNKNOWN_KIND: AssetKindMeta = { label: "Bem", plural: "Outros", icon: "tag", color: "slate" };

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && (ASSET_KINDS as readonly string[]).includes(value);
}

export function assetKindMeta(kind: unknown): AssetKindMeta {
  return isAssetKind(kind) ? KIND_META[kind] : UNKNOWN_KIND;
}
