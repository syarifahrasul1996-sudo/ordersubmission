import { db } from './db.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(id: string, email: string) {
  const result = await db.insert(users)
    .values({
      id,
      email,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email,
      },
    })
    .returning();

  return result[0];
}
