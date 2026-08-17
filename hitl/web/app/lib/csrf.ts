import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const CSRF_TOKEN_TTL_MS = 30 * 60 * 1000;

function loadCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) {
    throw new Error("CSRF_SECRET environment variable must be set");
  }
  return secret;
}

const CSRF_SECRET = loadCsrfSecret();

export function createCsrfToken(sessionId: string): string {
  const issuedAt = Date.now();
  const random = randomBytes(16).toString("hex");
  const payload = `${sessionId}:${issuedAt}:${random}`;
  const signature = createHmac("sha256", CSRF_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}:${signature}`;
}

export function verifyCsrfToken(token: string, sessionId: string): boolean {
  const parts = token.split(":");
  if (parts.length !== 4) return false;
  const [tokenSessionId, issuedAtRaw, random, signature] = parts;
  if (tokenSessionId !== sessionId) return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > Date.now()) return false;
  if (Date.now() - issuedAt > CSRF_TOKEN_TTL_MS) return false;
  const expected = createHmac("sha256", CSRF_SECRET)
    .update(`${tokenSessionId}:${issuedAt}:${random}`)
    .digest("hex");
  const actualBytes = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
