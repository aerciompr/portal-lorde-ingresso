// lib/masks.ts
// Brazilian CPF and phone masks + validators (no extra deps)

export function cleanDigits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function formatCpf(value: string): string {
  const d = cleanDigits(value).slice(0, 11);
  if (!d) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function isValidCpf(cpf: string): boolean {
  const d = cleanDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // all same digits

  // 1st digit
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * (10 - i);
  let mod = (sum * 10) % 11;
  if (mod === 10 || mod === 11) mod = 0;
  if (mod !== parseInt(d[9], 10)) return false;

  // 2nd digit
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * (11 - i);
  mod = (sum * 10) % 11;
  if (mod === 10 || mod === 11) mod = 0;
  return mod === parseInt(d[10], 10);
}

export function formatPhone(value: string): string {
  const d = cleanDigits(value).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  // 11 digits (mobile)
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhone(phone: string): boolean {
  const d = cleanDigits(phone);
  return d.length === 10 || d.length === 11;
}

// For display in some places (keep only digits for storage / API)
export function cleanCpf(value: string): string {
  return cleanDigits(value);
}

export function cleanPhone(value: string): string {
  return cleanDigits(value);
}

/** CEP: 00000-000 */
export function formatCep(value: string): string {
  const d = cleanDigits(value).slice(0, 8);
  if (!d) return '';
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function cleanCep(value: string): string {
  return cleanDigits(value).slice(0, 8);
}

export function isValidCep(value: string): boolean {
  return cleanCep(value).length === 8;
}
