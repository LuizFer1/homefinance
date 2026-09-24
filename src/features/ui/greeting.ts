function periodOf(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "Olá";
  if (hour < 6) return "Boa madrugada";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Saudação pela hora local do aparelho, com o nome do perfil quando ele existe.
 *
 * A hora entra por parâmetro, como o `today` do App: ler o relógio aqui dentro
 * faria o teste depender da hora em que roda, e a suíte passaria de manhã e
 * falharia à noite.
 *
 * O nome é **opcional** e não some a saudação quando falta. Um aparelho pode
 * legitimamente não ter perfil local: enquanto o wizard não conclui, e no
 * histórico gravado antes desta fatia.
 */
export function greetingFor(hour: number, name?: string): string {
  const base = periodOf(hour);
  const trimmed = name?.trim() ?? "";
  return trimmed === "" ? base : `${base}, ${trimmed}`;
}
