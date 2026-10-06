// Password hashing and signed session cookies, using only the Web Crypto API
// that Cloudflare Workers (and Node 18+) provide. No dependencies.

import { getCookie } from './http.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
export const DEFAULT_ITERATIONS = 100000; // Workers cap PBKDF2 at 100,000

// ---------- base64url ----------
export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- passwords (PBKDF2-SHA256) ----------
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Stored format: pbkdf2-sha256$<iterations>$<salt>$<hash>
export async function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltStr, hashStr] = String(stored).split('$');
    const iterations = Number(iterStr);
    if (scheme !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1 || iterations > 100000) {
      return false;
    }
    const expected = fromB64url(hashStr);
    const actual = await derive(password, fromB64url(saltStr), iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Spend the same effort when the username doesn't exist, so response time
// doesn't reveal which usernames are real.
export async function burnTime(password) {
  await derive(password, new Uint8Array(16), DEFAULT_ITERATIONS);
}

// ---------- users ----------
// USERS is a secret holding JSON: {"alice":"pbkdf2-sha256$...","bob":"..."}
export function loadUsers(env) {
  try {
    const users = JSON.parse(env.USERS || '');
    return users && typeof users === 'object' && !Array.isArray(users) ? users : null;
  } catch {
    return null;
  }
}

// ---------- sessions (HMAC-signed cookie) ----------
async function hmacKey(secret, usages) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

export async function signSession(env, username) {
  const payload = b64url(
    enc.encode(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }))
  );
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET, ['sign']), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(env, token) {
  if (!token || !env.SESSION_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(env.SESSION_SECRET, ['verify']),
      fromB64url(sig),
      enc.encode(payload)
    );
    if (!ok) return null;
    const data = JSON.parse(dec.decode(fromB64url(payload)));
    if (typeof data.u !== 'string' || typeof data.exp !== 'number') return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.u;
  } catch {
    return null;
  }
}

// ---------- cookie ----------
// On HTTPS we use the strict "__Host-" prefix. On http://localhost (dev only)
// browsers reject Secure cookies in some cases, so we fall back to a plain name.
function cookieName(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-session' : 'session';
}

export function sessionCookie(request, token, maxAge = SESSION_TTL_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function currentUser(request, env) {
  return verifySession(env, getCookie(request, cookieName(request)));
}
