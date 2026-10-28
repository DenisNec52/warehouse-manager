/**
 * lib/passwordPolicy.js — stessa regola del backend (backend/utils/passwordPolicy.js).
 * Il controllo vero è sul server; qui serve solo a dare subito un messaggio chiaro.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblem(pw, username) {
  if (!pw || pw.length < MIN_PASSWORD_LENGTH) return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
  if (new TextEncoder().encode(pw).length > 72) return "Password troppo lunga (massimo 72 caratteri).";
  if (username && pw.toLowerCase().includes(String(username).toLowerCase())) return "La password non può contenere lo username.";
  return null;
}
