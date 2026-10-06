import { burnTime, loadUsers, sessionCookie, signSession, verifyPassword } from '../_lib/auth.js';
import { isSameOrigin, json, readJson } from '../_lib/http.js';
import { clearFailures, recordFailure, tooManyFailures } from '../_lib/ratelimit.js';

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: 'FORBIDDEN' }, 403);

  const users = loadUsers(env);
  if (!users || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return json({ error: 'NOT_CONFIGURED' }, 500);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (tooManyFailures(ip)) return json({ error: 'TOO_MANY_ATTEMPTS' }, 429, { 'Retry-After': '900' });

  const body = await readJson(request, 2048);
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password || username.length > 100 || password.length > 200) {
    recordFailure(ip);
    return json({ error: 'INVALID_CREDENTIALS' }, 401);
  }

  const known = Object.hasOwn(users, username);
  let ok = false;
  if (known) ok = await verifyPassword(password, users[username]);
  else await burnTime(password);

  if (!ok) {
    recordFailure(ip);
    return json({ error: 'INVALID_CREDENTIALS' }, 401);
  }

  clearFailures(ip);
  const token = await signSession(env, username);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, token) });
}
