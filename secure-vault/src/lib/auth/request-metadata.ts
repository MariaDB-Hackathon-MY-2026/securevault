import { headers } from "next/headers";

import type { DeviceInfo } from "@/lib/auth/session";
import { DEVICE_NAME_MAX_LENGTH, IP_ADDRESS_MAX_LENGTH } from "@/lib/constants";

export async function getRequestMetaData(): Promise<DeviceInfo> {
  const requestHeaders = await headers();
  const ipAddress = getClientIpFromHeaders(requestHeaders);
  const userAgent = requestHeaders.get("user-agent") ?? "unknown";

  return {
    device_name: getDeviceName(userAgent),
    ip_address: ipAddress,
  };
}

export async function getRequestClientIp() {
  const requestHeaders = await headers();

  return getClientIpFromHeaders(requestHeaders);
}

export function getClientIpFromHeaders(
  requestHeaders: Pick<Headers, "get"> | { get(name: string): string | null | undefined },
) {
  return truncateValue(
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-real-ip") ??
      "unknown",
    IP_ADDRESS_MAX_LENGTH,
  );
}

function getDeviceName(userAgent: string): string {
  const browser = detectBrowser(userAgent);
  const platform = detectPlatform(userAgent);

  return truncateValue(`${browser} on ${platform}`, DEVICE_NAME_MAX_LENGTH);
}

function detectBrowser(userAgent: string): string {
  if (/Edg\//i.test(userAgent)) {
    return "Edge";
  }

  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) {
    return "Chrome";
  }

  if (/Firefox\//i.test(userAgent)) {
    return "Firefox";
  }

  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) {
    return "Safari";
  }

  return "Unknown browser";
}

function detectPlatform(userAgent: string): string {
  if (/Windows/i.test(userAgent)) {
    return "Windows";
  }

  if (/(iPhone|iPad|iPod)/i.test(userAgent)) {
    return "iOS";
  }

  if (/Android/i.test(userAgent)) {
    return "Android";
  }

  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return "macOS";
  }

  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return "Unknown device";
}

function truncateValue(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
