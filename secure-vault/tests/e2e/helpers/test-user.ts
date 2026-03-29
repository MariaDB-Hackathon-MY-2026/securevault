import type { TestInfo } from "@playwright/test";

export type TestUserCredentials = {
  email: string;
  name: string;
  password: string;
};

const DEFAULT_TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? "playwright-upload@example.com";
const DEFAULT_TEST_NAME = process.env.PLAYWRIGHT_TEST_NAME ?? "Playwright Upload User";
const DEFAULT_TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "VeryStrongPass123!Secure";

export function buildTestUserCredentials(testInfo: TestInfo): TestUserCredentials {
  const [localPart, domainPart = "example.com"] = DEFAULT_TEST_EMAIL.split("@");
  const slug = slugify(testInfo.titlePath.join("-"));
  const uniqueSuffix = `${slug}-${testInfo.workerIndex}-${testInfo.retry}`;

  return {
    email: `${localPart}+${uniqueSuffix}@${domainPart}`,
    name: DEFAULT_TEST_NAME,
    password: DEFAULT_TEST_PASSWORD,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
