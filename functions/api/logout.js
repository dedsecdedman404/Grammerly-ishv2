import { sessionCookie } from '../_lib/auth.js';
import { isSameOrigin, json } from '../_lib/http.js';

export async function onRequestPost({ request }) {
  if (!isSameOrigin(request)) return json({ error: 'FORBIDDEN' }, 403);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
}
