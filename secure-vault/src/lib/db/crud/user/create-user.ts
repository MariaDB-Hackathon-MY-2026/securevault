import { nanoid } from "nanoid";

import { USER_ID_LENGTH } from "@/lib/constants";
import { MariadbConnection } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { usersInsert } from "@/lib/db/schema";

export type CreateUserInput = Pick<
  usersInsert,
  "email" | "name" | "password_hash" | "encrypted_uek"
> & {
  email_verified?: boolean;
};

export async function createUser({
  email,
  name,
  password_hash,
  encrypted_uek,
  email_verified = true,
}: CreateUserInput): Promise<string> {
  const userId = nanoid(USER_ID_LENGTH);
  const db = MariadbConnection.getConnection();

  await db.insert(users).values({
    id: userId,
    email,
    name,
    password_hash,
    encrypted_uek,
    email_verified,
  });

  return userId;
}
