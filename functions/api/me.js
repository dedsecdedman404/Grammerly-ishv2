import { currentUser } from '../_lib/auth.js';
import { json } from '../_lib/http.js';

// Lets the page ask "am I still logged in?" on load.
export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);
  return json({ user });
}
