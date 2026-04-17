type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
};

const store = new Map<string, RateLimitEntry>();

function checkRateLimitInMemory(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + options.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt,
      retryAfterMs: 0,
    };
  }

  if (current.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  }

  current.count += 1;
  store.set(key, current);
  return {
    allowed: true,
    remaining: Math.max(0, options.maxRequests - current.count),
    resetAt: current.resetAt,
    retryAfterMs: 0,
  };
}

function getUpstashConfig() {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!rawUrl || !token) {
    return null;
  }

  const url = rawUrl.replace(/\/+$/, "");
  return { token, url };
}

async function checkRateLimitDistributed(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const config = getUpstashConfig();
  if (!config) {
    throw new Error("Upstash Redis rate limiter is not configured.");
  }

  const now = Date.now();
  const windowStart = now - (now % options.windowMs);
  const resetAt = windowStart + options.windowMs;
  const retryAfterMs = Math.max(0, resetAt - now);
  const ttlSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const redisKey = `rate-limit:${key}:${windowStart}`;
  const encodedKey = encodeURIComponent(redisKey);
  const headers: HeadersInit = {
    Authorization: `Bearer ${config.token}`,
  };

  const incrementResponse = await fetch(`${config.url}/incr/${encodedKey}`, {
    method: "POST",
    headers,
    cache: "no-store",
  });

  if (!incrementResponse.ok) {
    throw new Error(`Rate limit increment failed with status ${incrementResponse.status}.`);
  }

  const incrementPayload = (await incrementResponse.json()) as { result?: number | string };
  const count = Number(incrementPayload.result);

  if (!Number.isFinite(count)) {
    throw new Error("Rate limit increment returned an invalid count.");
  }

  await fetch(`${config.url}/expire/${encodedKey}/${ttlSeconds}`, {
    method: "POST",
    headers,
    cache: "no-store",
  }).catch(() => undefined);

  const allowed = count <= options.maxRequests;
  return {
    allowed,
    remaining: Math.max(0, options.maxRequests - count),
    resetAt,
    retryAfterMs: allowed ? 0 : retryAfterMs,
  };
}

export async function checkRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const upstashConfigured = Boolean(getUpstashConfig());
  if (!upstashConfigured) {
    return checkRateLimitInMemory(key, options);
  }

  try {
    return await checkRateLimitDistributed(key, options);
  } catch (error) {
    // Fallback to per-instance in-memory counter on Upstash outage.
    // This is a deliberate fail-open across instances: users keep getting served,
    // but cross-instance coordination is lost until Upstash recovers.
    // For auth/write endpoints consider a stricter policy (fail-closed) via
    // a callsite wrapper in api-security.
    console.error("[rate-limit] Upstash unavailable, falling back to in-memory", error);
    return checkRateLimitInMemory(key, options);
  }
}

export function getClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}
