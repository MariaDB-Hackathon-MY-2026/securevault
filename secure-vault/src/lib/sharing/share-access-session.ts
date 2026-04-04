import { cookies } from "next/headers";

import { decrypt, encrypt } from "@/lib/crypto/aes";
import { AUTH_COOKIE_SECURE } from "@/lib/auth/cookies";
import { getMasterKey } from "@/lib/crypto/keys";
import { assertShareLinkAccessible, getShareLinkByToken } from "@/lib/sharing/share-service";

export type ShareAccessSession = {
  email: string;
  expiresAt: string;
  linkId: string;
  verifiedAt: string;
};

function getCookieName(linkId: string) {
  return `${AUTH_COOKIE_SECURE ? "__Secure-" : ""}share-${linkId}`;
}

function getShareAccessCookieOptions(maxAge?: number) {
  return {
    httpOnly: true as const,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: AUTH_COOKIE_SECURE,
  };
}

export async function createShareAccessSession(input: {
  email: string;
  expiresAt: Date;
  linkId: string;
}) {
  const cookieStore = await cookies();
  const session: ShareAccessSession = {
    email: input.email,
    expiresAt: input.expiresAt.toISOString(),
    linkId: input.linkId,
    verifiedAt: new Date().toISOString(),
  };

  cookieStore.set({
    expires: input.expiresAt,
    name: getCookieName(input.linkId),
    ...getShareAccessCookieOptions(),
    value: encrypt(Buffer.from(JSON.stringify(session), "utf-8"), getMasterKey()).toString("hex"),
  });
}

export async function readShareAccessSession(linkId: string) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(getCookieName(linkId))?.value;

  if (!cookieValue) {
    return null;
  }

  try {
    const decryptedPayload = decrypt(Buffer.from(cookieValue, "hex"), getMasterKey());
    const session = JSON.parse(decryptedPayload.toString("utf-8")) as ShareAccessSession;

    if (session.linkId !== linkId) {
      return null;
    }

    if (new Date(session.expiresAt) < new Date()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function requireValidShareAccessSession(input: { linkId: string; token: string }) {
  const session = await readShareAccessSession(input.linkId);

  if (!session) {
    return null;
  }

  const link = await getShareLinkByToken(input.token);

  if (!link || link.id !== input.linkId) {
    return null;
  }

  try {
    assertShareLinkAccessible(link);
  } catch {
    return null;
  }

  return session;
}

export async function clearShareAccessSession(linkId: string) {
  const cookieStore = await cookies();
  cookieStore.set(getCookieName(linkId), "", getShareAccessCookieOptions(0));
}
