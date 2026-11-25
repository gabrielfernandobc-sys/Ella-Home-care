/** Nome da aba mensal a partir da data da nota. */
import { MESES, parseData } from "./texto";

export const PADROES_ABA = ["{MES} {AAAA}", "{MM}-{AAAA}", "{MM}/{AAAA}", "{AAAA}-{MM}", "{MES3}/{AA}"];

/**
 * Placeholders: {AAAA} ano, {AA} ano com 2 dígitos, {MM} mês com 2 dígitos,
 * {MES} "Novembro", {mes} "novembro", {MES3} "Nov".
 */
export function nomeAbaMensal(padrao: string, data: string | null | undefined): string | null {
  const iso = parseData(data);
  if (!iso) return null;
  const [a, m] = iso.split("-");
  const nomeMes = MESES[Number(m) - 1];
  return padrao
    .replaceAll("{AAAA}", a)
    .replaceAll("{AA}", a.slice(2))
    .replaceAll("{MM}", m)
    .replaceAll("{MES3}", nomeMes.slice(0, 3))
    .replaceAll("{MES}", nomeMes)
    .replaceAll("{mes}", nomeMes.toLowerCase());
}
