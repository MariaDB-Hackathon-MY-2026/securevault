import type { InferInsertModel } from "drizzle-orm";
import { nanoid } from "nanoid";

import { MariadbConnection } from "@/lib/db";
import { users } from "@/lib/db/schema";

const USER_ID_LENGTH = 21;

export type CreateUserInput = Pick<
  InferInsertModel<typeof users>,
  "email" | "name" | "password_hash" | "encrypted_uek"
>;

export async function createUser({
  email,
  name,
  password_hash,
  encrypted_uek,
}: CreateUserInput): Promise<string> {
  const userId = nanoid(USER_ID_LENGTH);
  const db = MariadbConnection.getConnection();

  await db.insert(users).values({
    id: userId,
    email,
    name,
    password_hash,
    encrypted_uek,
  });

  return userId;
}
