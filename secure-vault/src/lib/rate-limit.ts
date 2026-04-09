import { NextResponse } from "next/server";

import { getRedisAdapter } from "@/lib/redis";

export type RateLimitPolicy = {
  limit: number;
  message: string;
  prefix: string;
  windowSeconds: number;
};

export type RateLimitResult = {
  headers: Headers;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  success: boolean;
};

function isRateLimitDebugEnabled() {
  return process.env.REDIS_DEBUG_TIMING === "1" || process.env.REDIS_DEBUG_TIMING === "true";
}

function logRateLimitDebug(message: string, durationMs?: number) {
  if (!isRateLimitDebugEnabled()) {
    return;
  }

  if (typeof durationMs === "number") {
    console.info(`[rate-limit-debug] ${message} (${durationMs.toFixed(1)}ms)`);
    return;
  }

  console.info(`[rate-limit-debug] ${message}`);
}

export const loginLimiter: RateLimitPolicy = {
  limit: 5,
  message: "Too many attempts. Please try again later.",
  prefix: "rate-limit:login",
  windowSeconds: 15 * 60,
};

export const signupLimiter: RateLimitPolicy = {
  limit: 5,
  message: "Too many attempts. Please try again later.",
  prefix: "rate-limit:signup",
  windowSeconds: 60 * 60,
};

export const otpRequestLimiter: RateLimitPolicy = {
  limit: 3,
  message: "Too many verification requests. Please try again later.",
  prefix: "rate-limit:share-otp-request",
  windowSeconds: 15 * 60,
};

export const otpVerifyLimiter: RateLimitPolicy = {
  limit: 3,
  message: "Too many verification attempts. Please try again later.",
  prefix: "rate-limit:share-otp-verify",
  windowSeconds: 5 * 60,
};

export const passwordResetRequestLimiter: RateLimitPolicy = {
  limit: 3,
  message: "Too many password reset requests. Please try again later.",
  prefix: "rate-limit:password-reset-request",
  windowSeconds: 15 * 60,
};

export const passwordResetVerifyLimiter: RateLimitPolicy = {
  limit: 5,
  message: "Too many password reset attempts. Please try again later.",
  prefix: "rate-limit:password-reset-verify",
  windowSeconds: 15 * 60,
};

export const uploadLimiter: RateLimitPolicy = {
  limit: 100,
  message: "Too many upload requests. Please try again later.",
  prefix: "rate-limit:upload",
  windowSeconds: 60,
};

export const downloadLimiter: RateLimitPolicy = {
  limit: 30,
  message: "Too many download requests. Please try again later.",
  prefix: "rate-limit:download",
  windowSeconds: 60,
};

export async function enforceRateLimit(
  policy: RateLimitPolicy,
  key: string,
): Promise<RateLimitResult> {
  const startedAt = performance.now();

  try {
    const adapter = await getRedisAdapter();
    const counterKey = `${policy.prefix}:${key}`;
    const currentCount = await adapter.incr(counterKey);

    if (currentCount === 1) {
      await adapter.expire(counterKey, policy.windowSeconds);
    }

    const ttl = await adapter.ttl(counterKey);
    const retryAfterSeconds = ttl > 0 ? ttl : policy.windowSeconds;
    const remaining = Math.max(0, policy.limit - currentCount);
    const resetAt = new Date(Date.now() + (retryAfterSeconds * 1000));

    const result = {
      headers: createRateLimitHeaders({
        limit: policy.limit,
        remaining,
        retryAfterSeconds,
        success: currentCount <= policy.limit,
      }),
      limit: policy.limit,
      remaining,
      resetAt,
      retryAfterSeconds,
      success: currentCount <= policy.limit,
    };

    logRateLimitDebug(`Allowed ${counterKey}`, performance.now() - startedAt);
    return result;
  } catch (error) {
    console.warn(`Rate limiting unavailable for ${policy.prefix}; allowing request`, error);
    logRateLimitDebug(`Failed open for ${policy.prefix}:${key}`, performance.now() - startedAt);

    return {
      headers: new Headers(),
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: new Date(Date.now() + (policy.windowSeconds * 1000)),
      retryAfterSeconds: policy.windowSeconds,
      success: true,
    };
  }
}

export function createRateLimitResponse(
  result: RateLimitResult,
  message = "Too many requests. Please try again later.",
) {
  return NextResponse.json(
    { message },
    {
      headers: result.headers,
      status: 429,
    },
  );
}

function createRateLimitHeaders(input: {
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  success: boolean;
}) {
  const headers = new Headers();

  headers.set("Retry-After", String(input.retryAfterSeconds));
  headers.set("X-RateLimit-Limit", String(input.limit));
  headers.set("X-RateLimit-Remaining", String(input.remaining));

  if (!input.success) {
    headers.set("X-RateLimit-Policy", "fixed-window");
  }

  return headers;
}
