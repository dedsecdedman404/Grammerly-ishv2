// Everything specific to the text-rewriting service lives in this one file.
// To switch to a different (e.g. official) API later, change only this file
// plus the UPSTREAM_URL / UPSTREAM_KEY secrets. The rest of the app stays the same.

export function buildRequest(text, env) {
  const headers = { 'Content-Type': 'application/json' };
  // If your provider gives you an API key, set UPSTREAM_KEY as a secret.
  // It is added here, on the server, and never reaches the browser.
  if (env.UPSTREAM_KEY) headers.Authorization = `Bearer ${env.UPSTREAM_KEY}`;

  // Same request body the original app.js sent.
  const body = {
    prompt: text,
    promptOptions: {
      fluency: '🔄 Default',
      tone: '🔄 Default',
      emotion: '🔄 Default',
      audience: '🌍 General',
      length: '🔄 Default',
      language: '🇬🇧 English (UK)',
    },
    isHumanizeEnabled: true,
    rephraseType: 'Rewriter',
    selectedModel: 'LUMENARIS',
  };

  return { url: env.UPSTREAM_URL, init: { method: 'POST', headers, body: JSON.stringify(body) } };
}

// Same recursive search the original app.js used to find the text in the reply.
export function extractText(obj) {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = extractText(item);
      if (r) return r;
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      const r = extractText(obj[key]);
      if (r) return r;
    }
  }
  return null;
}
