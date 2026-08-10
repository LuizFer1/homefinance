/**
 * Saudação pela hora local do aparelho.
 *
 * A hora entra por parâmetro, como o `today` do App: ler o relógio aqui dentro
 * faria o teste depender da hora em que roda, e a suíte passaria de manhã e
 * falharia à noite.
 *
 * Sem nome por enquanto. O nome vem do perfil local, que é a fatia 2 e ainda não
 * existe — inventar um nome no `meta` contrariaria a decisão de que tudo é
 * evento, e um perfil fora do log não sincronizaria.
 */
export function greetingFor(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return "Olá";
  if (hour < 6) return "Boa madrugada";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
