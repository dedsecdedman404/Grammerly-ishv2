import { currentUser } from '../_lib/auth.js';
import { isSameOrigin, json, readJson } from '../_lib/http.js';
import { buildRequest, extractText } from '../_lib/upstream.js';

const DEFAULT_MAX_CHARS = 6000;
const UPSTREAM_TIMEOUT_MS = 55000;

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: 'FORBIDDEN' }, 403);

  // Nothing happens without a valid, unexpired, signed session.
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

  if (!env.UPSTREAM_URL) return json({ error: 'NOT_CONFIGURED' }, 500);

  const maxChars = Number(env.MAX_CHARS) || DEFAULT_MAX_CHARS;
  const body = await readJson(request, maxChars * 4 + 1024); // *4 allows multi-byte characters
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ error: 'EMPTY_TEXT' }, 400);
  if (text.length > maxChars) return json({ error: 'TEXT_TOO_LONG', max: maxChars }, 413);

  const { url, init } = buildRequest(text, env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, { ...init, signal: controller.signal });
    if (!upstream.ok) return json({ error: 'UPSTREAM_ERROR' }, 502);

    const data = await upstream.json();
    const result = extractText(data);
    if (!result) return json({ error: 'DATA_PARSE_FAILURE' }, 502);
    return json({ text: result });
  } catch (err) {
    // Details stay in the server logs; the browser only gets a generic code.
    console.error('humanise failed:', err && err.name);
    return json({ error: err && err.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR' }, 504);
  } finally {
    clearTimeout(timer);
  }
}
