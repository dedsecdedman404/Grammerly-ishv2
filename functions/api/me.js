import { currentUser } from '../_lib/auth.js';
import { getMaxChars } from '../_lib/config.js';
import { json } from '../_lib/http.js';

// Lets the page ask "am I still logged in?" on load, and learn the text limit.
export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);
  return json({ user, maxChars: getMaxChars(env) });
}
