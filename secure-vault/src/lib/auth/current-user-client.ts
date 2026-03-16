import type { SanitizedUser } from "@/lib/auth/session";

export type CurrentUserClient = Omit<SanitizedUser, "created_at"> & {
  created_at: string;
};

type SerializableCurrentUser = Omit<SanitizedUser, "created_at"> & {
  created_at: Date;
};

export const currentUserQueryKey = ["current-user"] as const;

export function toCurrentUserClient(user: SerializableCurrentUser): CurrentUserClient {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    storage_used: user.storage_used,
    storage_quota: user.storage_quota,
    email_verified: user.email_verified,
    created_at: user.created_at.toISOString(),
  };
}
