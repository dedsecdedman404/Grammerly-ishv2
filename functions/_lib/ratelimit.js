// Best-effort in-memory limiter. Each Cloudflare isolate keeps its own counts,
// so this slows down casual guessing but is NOT a hard guarantee.
// The real protection is the Cloudflare WAF rate-limiting rule described in
// DEPLOY.md, which counts across the whole network.

const buckets = new Map();

export function tooManyFailures(key, { limit = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }
  const b = buckets.get(key);
  return !!b && b.reset >= now && b.count >= limit;
}

export function recordFailure(key, { windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) buckets.set(key, { count: 1, reset: now + windowMs });
  else b.count += 1;
}

export function clearFailures(key) {
  buckets.delete(key);
}
