import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createClient } from "redis";

import { ensureTestEnvLoaded } from "./load-test-env";

ensureTestEnvLoaded();

const RATE_LIMIT_PREFIXES = [
  "rate-limit:login",
  "rate-limit:signup",
  "rate-limit:password-reset-request",
  "rate-limit:password-reset-verify",
  "rate-limit:share-otp-request",
  "rate-limit:share-otp-verify",
  "rate-limit:upload",
  "rate-limit:download",
] as const;

function shouldSkipRateLimitCleanup() {
  return (
    process.env.DISABLE_REDIS === "1"
    || process.env.DISABLE_REDIS === "true"
    || !process.env.REDIS_URL?.trim()
  );
}

async function clearRateLimitCounters() {
  if (shouldSkipRateLimitCleanup()) {
    return;
  }

  const client = createClient({
    url: process.env.REDIS_URL,
  });

  try {
    await client.connect();

    const keys = new Set<string>();

    for (const prefix of RATE_LIMIT_PREFIXES) {
      for await (const keyBatch of client.scanIterator({
        MATCH: `${prefix}:*`,
        COUNT: 100,
      })) {
        for (const key of keyBatch) {
          keys.add(key);
        }
      }
    }

    if (keys.size > 0) {
      await client.del([...keys]);
    }
  } catch (error) {
    console.warn("Playwright could not clear Redis rate-limit counters.", error);
  } finally {
    if (client.isOpen) {
      await client.quit().catch(() => undefined);
    }
  }
}

export const test = base.extend<{
  _resetRateLimitCounters: void;
}>({
  _resetRateLimitCounters: [async ({}, runFixture) => {
    await clearRateLimitCounters();

    try {
      await runFixture();
    } finally {
      await clearRateLimitCounters();
    }
  }, { auto: true }],
});

export { expect };
export type { Browser, BrowserContext, Locator, Page, TestInfo };
