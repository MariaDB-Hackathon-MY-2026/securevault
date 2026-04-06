function isTruthy(value: string | undefined) {
  return value === "1" || value === "true";
}

export function isAuthDebugEnabled() {
  return isTruthy(process.env.AUTH_DEBUG_FLOW) || isTruthy(process.env.REDIS_DEBUG_TIMING);
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return email;
  }

  const maskedLocalPart =
    localPart.length <= 2
      ? `${localPart[0] ?? "*"}*`
      : `${localPart[0]}***${localPart[localPart.length - 1]}`;

  return `${maskedLocalPart}@${domain}`;
}

export function logAuthDebug(
  action: "login" | "signup",
  branch: string,
  details?: Record<string, string | number | boolean | null | undefined>,
) {
  if (!isAuthDebugEnabled()) {
    return;
  }

  const normalizedDetails = details
    ? Object.entries(details).filter(([, value]) => value !== undefined)
    : [];

  const detailsSuffix =
    normalizedDetails.length > 0
      ? ` ${normalizedDetails
          .map(([key, value]) => {
            if (key === "email" && typeof value === "string") {
              return `${key}=${maskEmail(value)}`;
            }

            return `${key}=${String(value)}`;
          })
          .join(" ")}`
      : "";

  console.info(`[auth-debug] ${action} ${branch}${detailsSuffix}`);
}
