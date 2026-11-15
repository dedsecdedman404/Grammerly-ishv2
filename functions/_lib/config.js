// One place for settings shared by several routes.
export const DEFAULT_MAX_CHARS = 6000;

export function getMaxChars(env) {
  const n = Number(env.MAX_CHARS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_CHARS;
}
