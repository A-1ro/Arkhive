export function parseNumericInput(
  text: string,
  decimal = false,
): number | null {
  const normalized = text.normalize("NFKC").trim();
  const pattern = decimal ? /^-?(?:\d+(?:\.\d*)?|\.\d+)$/ : /^-?\d+$/;
  if (!pattern.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
