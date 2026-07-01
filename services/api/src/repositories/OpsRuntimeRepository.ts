import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type OpsRuntimeMode = 'normal' | 'draining' | 'maintenance';

export class OpsRuntimeRepository {
  constructor(private db: NodePgDatabase<typeof schema>) {}

  async getGlobalState(): Promise<schema.OpsRuntimeState> {
    const [state] = await this.db
      .select()
      .from(schema.opsRuntimeState)
      .where(eq(schema.opsRuntimeState.id, 'global'))
      .limit(1);

    if (state) return state;

    const [created] = await this.db
      .insert(schema.opsRuntimeState)
      .values({ id: 'global', mode: 'normal' })
      .onConflictDoNothing()
      .returning();

    if (created) return created;

    const [existing] = await this.db
      .select()
      .from(schema.opsRuntimeState)
      .where(eq(schema.opsRuntimeState.id, 'global'))
      .limit(1);
    if (!existing) throw new Error('Failed to initialize ops runtime state');
    return existing;
  }

  async updateGlobalState(input: {
    mode: OpsRuntimeMode;
    message?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    updatedByUserId?: string | null;
  }): Promise<schema.OpsRuntimeState> {
    await this.getGlobalState();
    const [state] = await this.db
      .update(schema.opsRuntimeState)
      .set({
        mode: input.mode,
        message: input.message ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        updatedByUserId: input.updatedByUserId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.opsRuntimeState.id, 'global'))
      .returning();

    if (!state) throw new Error('Failed to update ops runtime state');
    return state;
  }
}
