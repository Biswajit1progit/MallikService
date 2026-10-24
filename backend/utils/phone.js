// 10-digit Indian mobile (starts 6-9); strips +91 / spaces / dashes.
export function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}