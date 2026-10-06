# Deploying to Cloudflare Pages (free)

Your UI is unchanged. What changed:

- `app.js` no longer contains a login, a password, or the API address. It only talks to your own `/api/...` routes.
- `functions/` is a small server that runs on Cloudflare. It checks logins, keeps secrets, and calls the rewriting service for you.
- `public/_headers` adds browser protections (CSP, no framing, HTTPS-only).

## 1. Create the users and secrets (on your computer, 2 minutes)

You need Node.js installed.

```
npm install
npm run hash
```

It asks for usernames and passwords (min 12 characters, hidden as you type) and prints two values: **USERS** and **SESSION_SECRET**. Keep that window open for step 3. Never put these in a file you commit.

## 2. Put the project on GitHub

1. Create a **private** repository on github.com and upload this whole folder (`.gitignore` already keeps secrets out).
2. Check that `.dev.vars` is NOT in the repository.

## 3. Create the Cloudflare project

1. Sign up free at dash.cloudflare.com, then **Workers & Pages → Create → Pages → Connect to Git**, and pick your repo.
2. Build settings: **Framework preset: None**. **Build command: (leave empty)**. **Build output directory: `public`**.
3. Before the first deploy, open **Settings → Variables and Secrets** (or add them on the setup screen) and add these as **Secret / Encrypt** type:

| Name | Value |
|---|---|
| `USERS` | the JSON line from step 1 |
| `SESSION_SECRET` | the 64-character value from step 1 |
| `UPSTREAM_URL` | the rewriting service address (see note below) |
| `UPSTREAM_KEY` | only if your provider gives you an API key |
| `MAX_CHARS` | optional, defaults to 6000 |

4. Deploy. You get a `https://yourproject.pages.dev` address with HTTPS.

## 4. Add the real rate limit (important, free)

The in-code limiter only slows guessing. For the real thing:
**Cloudflare dashboard → Security → WAF → Rate limiting rules → Create rule**

- If URI Path equals `/api/login`
- Rate: 5 requests per 1 minute (per IP), action: Block for 10 minutes.

The free plan includes one rule. Also turn on **Security → Bots → Bot Fight Mode**.

## 5. Check it works

1. Open your site. You should see the login screen and the same look as before.
2. Log in, paste text, run it.
3. Open DevTools → Console. If you see red "Refused to load..." messages and the page looks unstyled, tell me; the browser protection list needs one tweak. (Tested headers on Cloudflare's local runtime. The Tailwind CDN and Google Fonts could not be fetched from my test environment.)
4. Open DevTools → Network. You should see calls to `/api/humanise` only, with no upstream address anywhere.

## Changing a password / adding a user

Run `npm run hash` again, replace the `USERS` secret in Cloudflare, and redeploy (Deployments → Retry). Changing `SESSION_SECRET` logs everyone out.

## Important note on the rewriting service

`UPSTREAM_URL` currently points at the service your original `app.js` called. That service has no login of its own and isn't published as an API for developers, so it can block or change without notice, and your users would see "SERVICE_UNAVAILABLE". For something students depend on, switch to a provider with an official API and your own key. Only `functions/_lib/upstream.js` and the two secrets need to change.

## What this protects, and what it can't

Protected: nobody can log in without a real account, the upstream address and key are never in the browser, stolen or edited cookies are rejected, other websites can't make requests on your users' behalf, and error messages leak nothing.

Not protected: someone who learns a valid username and password can use the tool, so use strong, unique passwords. Whoever runs the upstream service can see the text students send, so tell your users. There is no per-user daily limit yet; I can add one if a provider charges per request.

## Local testing (optional)

```
cp .dev.vars.example .dev.vars   # fill in the values
npm run dev                      # http://localhost:8788
npm test                         # automated checks
```
