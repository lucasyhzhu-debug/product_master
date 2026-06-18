import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

describe("posSyncCheckpoint accessors", () => {
  it("upserts a single row and reads both cursors back", async () => {
    const t = convexTest(schema);
    expect(await t.query(internal.integrations.pos.checkpoint.getCheckpoint, {})).toBeNull();
    await t.mutation(internal.integrations.pos.checkpoint.persistSalesCursor, { cursor: "c-sales-1" });
    await t.mutation(internal.integrations.pos.checkpoint.persistRefundsCursor, { cursor: "c-ref-1" });
    const cp = await t.query(internal.integrations.pos.checkpoint.getCheckpoint, {});
    expect(cp).toMatchObject({ salesCursor: "c-sales-1", refundsCursor: "c-ref-1" });
    // second sales persist updates in place, does not insert a new row
    await t.mutation(internal.integrations.pos.checkpoint.persistSalesCursor, { cursor: "c-sales-2" });
    const all = await t.run(async (ctx) => ctx.db.query("posSyncCheckpoint").collect());
    expect(all).toHaveLength(1);
    expect(all[0].salesCursor).toBe("c-sales-2");
    expect(all[0].refundsCursor).toBe("c-ref-1");
  });
});
