// Run: node --test test/
// Exercises the real handlers with a fake upstream. No network needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, signSession, verifySession } from '../functions/_lib/auth.js';
import { onRequestPost as login } from '../functions/api/login.js';
import { onRequestPost as logout } from '../functions/api/logout.js';
import { onRequestGet as me } from '../functions/api/me.js';
import { onRequestPost as humanise } from '../functions/api/humanise.js';

const ORIGIN = 'https://app.example.com';
const env = {
  SESSION_SECRET: 'a'.repeat(64),
  USERS: JSON.stringify({ alice: await hashPassword('correct horse battery') }),
  UPSTREAM_URL: 'https://upstream.invalid/rewrite',
  UPSTREAM_KEY: 'sk-test-secret',
  MAX_CHARS: '100',
};

const post = (path, body, headers = {}) =>
  new Request(ORIGIN + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function loginCookie() {
  const res = await login({ request: post('/api/login', { username: 'alice', password: 'correct horse battery' }), env });
  assert.equal(res.status, 200);
  return res.headers.get('Set-Cookie').split(';')[0];
}

test('login: wrong password and unknown user get the same 401', async () => {
  const a = await login({ request: post('/api/login', { username: 'alice', password: 'nope' }), env });
  const b = await login({ request: post('/api/login', { username: 'ghost', password: 'nope' }), env });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(await a.json(), await b.json());
});

test('login: success sets a hardened cookie', async () => {
  const res = await login({ request: post('/api/login', { username: 'Alice ', password: 'correct horse battery' }), env });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('Set-Cookie');
  assert.match(cookie, /^__Host-session=/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(flag), flag);
});

test('login: rejects cross-site requests and non-JSON', async () => {
  const cross = await login({ request: post('/api/login', { username: 'alice', password: 'x' }, { Origin: 'https://evil.example' }), env });
  assert.equal(cross.status, 403);
  const form = new Request(ORIGIN + '/api/login', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: 'username=alice' });
  assert.equal((await login({ request: form, env })).status, 401);
});

test('login: refuses to run unconfigured or with a weak session secret', async () => {
  const r1 = await login({ request: post('/api/login', { username: 'alice', password: 'x' }), env: { ...env, SESSION_SECRET: 'short' } });
  const r2 = await login({ request: post('/api/login', { username: 'alice', password: 'x' }), env: { ...env, USERS: undefined } });
  assert.equal(r1.status, 500);
  assert.equal(r2.status, 500);
});

test('login: locks out an IP after repeated failures', async () => {
  const hdr = { 'CF-Connecting-IP': '203.0.113.9' };
  let last;
  for (let i = 0; i < 9; i++) last = await login({ request: post('/api/login', { username: 'alice', password: 'bad' }, hdr), env });
  assert.equal(last.status, 429);
  // even the right password is refused while locked out
  const locked = await login({ request: post('/api/login', { username: 'alice', password: 'correct horse battery' }, hdr), env });
  assert.equal(locked.status, 429);
});

test('humanise: no cookie, forged cookie, tampered cookie, expired cookie are all 401', async () => {
  const none = await humanise({ request: post('/api/humanise', { text: 'hi' }), env });
  assert.equal(none.status, 401);

  const forged = await humanise({ request: post('/api/humanise', { text: 'hi' }, { Cookie: '__Host-session=abc.def' }), env });
  assert.equal(forged.status, 401);

  const good = await signSession(env, 'alice');
  const [payload, sig] = good.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ u: 'admin', exp: 9999999999 })).toString('base64url');
  const tampered = await humanise({ request: post('/api/humanise', { text: 'hi' }, { Cookie: `__Host-session=${tamperedPayload}.${sig}` }), env });
  assert.equal(tampered.status, 401);

  const realDate = Date.now;
  Date.now = () => realDate() + 9 * 3600 * 1000;
  try {
    assert.equal(await verifySession(env, good), null);
  } finally {
    Date.now = realDate;
  }
  assert.equal(await verifySession({ ...env, SESSION_SECRET: 'b'.repeat(64) }, good), null);
});

test('humanise: valid session calls upstream with the key, and never leaks it', async () => {
  const cookie = await loginCookie();
  let seen;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ data: { output: 'Rewritten text.' } }), { status: 200 });
  };
  try {
    const res = await humanise({ request: post('/api/humanise', { text: 'Some input.' }, { Cookie: cookie }), env });
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.deepEqual(JSON.parse(raw), { text: 'Rewritten text.' });
    assert.ok(!raw.includes('sk-test-secret'));
    assert.ok(![...res.headers.values()].join(' ').includes('sk-test-secret'));
    assert.equal(seen.url, env.UPSTREAM_URL);
    assert.equal(seen.init.headers.Authorization, 'Bearer sk-test-secret');
    assert.equal(JSON.parse(seen.init.body).prompt, 'Some input.');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('humanise: input limits and upstream failures return generic errors', async () => {
  const cookie = await loginCookie();
  const empty = await humanise({ request: post('/api/humanise', { text: '   ' }, { Cookie: cookie }), env });
  assert.equal(empty.status, 400);
  const long = await humanise({ request: post('/api/humanise', { text: 'x'.repeat(101) }, { Cookie: cookie }), env });
  assert.equal(long.status, 413);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('secret internal stack trace', { status: 500 });
  try {
    const res = await humanise({ request: post('/api/humanise', { text: 'hello' }, { Cookie: cookie }), env });
    assert.equal(res.status, 502);
    assert.ok(!(await res.text()).includes('stack trace'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('me and logout', async () => {
  const cookie = await loginCookie();
  const ok = await me({ request: new Request(ORIGIN + '/api/me', { headers: { Cookie: cookie } }), env });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).user, 'alice');
  const anon = await me({ request: new Request(ORIGIN + '/api/me'), env });
  assert.equal(anon.status, 401);
  const out = await logout({ request: post('/api/logout', {}), env });
  assert.match(out.headers.get('Set-Cookie'), /Max-Age=0/);
});
