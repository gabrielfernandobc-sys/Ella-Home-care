import { apenasDigitos } from "./texto";

/**
 * Valida o dígito verificador do CNPJ.
 * Aceita o formato numérico (14 dígitos) e o alfanumérico que a Receita
 * passa a emitir a partir de 2026 (12 caracteres [0-9A-Z] + 2 dígitos).
 */
export function cnpjValido(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const limpo = String(valor).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[0-9A-Z]{12}\d{2}$/.test(limpo)) return false;
  if (/^(\d)\1{13}$/.test(limpo)) return false;
  const valores = [...limpo].map((c) => c.charCodeAt(0) - 48);
  const dv = (base: number[]) => {
    let peso = 2;
    let soma = 0;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += base[i] * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(valores.slice(0, 12));
  const d2 = dv([...valores.slice(0, 12), d1]);
  return d1 === valores[12] && d2 === valores[13];
}

/** "12345678000195" -> "12.345.678/0001-95". Se não tiver 14 caracteres, devolve como veio. */
export function formatarCnpj(valor: string | null | undefined): string {
  if (!valor) return "";
  const limpo = String(valor).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (limpo.length !== 14) return String(valor).trim();
  return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`;
}

export function chaveCnpj(valor: string | null | undefined): string {
  if (!valor) return "";
  return String(valor).toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Gera um CNPJ válido a partir de 12 dígitos base (útil para dados fictícios e testes). */
export function completarCnpj(base12: string): string {
  const b = apenasDigitos(base12).padStart(12, "0").slice(0, 12);
  const nums = [...b].map(Number);
  const dv = (base: number[]) => {
    let peso = 2;
    let soma = 0;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += base[i] * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(nums);
  const d2 = dv([...nums, d1]);
  return b + d1 + d2;
}

/** Valida a chave de acesso da NF-e (44 dígitos, dígito verificador módulo 11). */
export function chaveAcessoValida(chave: string | null | undefined): boolean {
  const c = apenasDigitos(chave);
  if (c.length !== 44) return false;
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(c[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(c[43]);
}

/** Completa uma chave de 43 dígitos com o dígito verificador (para dados fictícios). */
export function completarChaveAcesso(base43: string): string {
  const c = apenasDigitos(base43).padStart(43, "0").slice(0, 43);
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(c[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return c + (resto < 2 ? 0 : 11 - resto);
}
