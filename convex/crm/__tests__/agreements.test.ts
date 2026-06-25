/**
 * Tests for convex/crm/agreements.ts — T7.
 *
 * Auth pattern: insert user + session via t.run(), pass sessionId to handler.
 * Storage note: convex-test supports storageGenerateUploadUrl (returns a fake
 * URL string) so generateAgreementUploadUrl can be tested end-to-end.
 * For fileStorageId fixtures we insert a minimal _storage row via t.run() so
 * the typed Id<"_storage"> resolves correctly.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import { anyApi } from "convex/server";
import schema from "../../schema";
import type { Id, Doc } from "../../_generated/dataModel";

// Function references via anyApi — not yet in _generated/api.d.ts (T9 codegen).
const generateAgreementUploadUrlRef = anyApi.crm.agreements.generateAgreementUploadUrl;
const createSupplyAgreementRef = anyApi.crm.agreements.createSupplyAgreement;
const addAgreementVersionRef = anyApi.crm.agreements.addAgreementVersion;
const linkAgreementToSubscriptionRef = anyApi.crm.agreements.linkAgreementToSubscription;
const getAgreementRef = anyApi.crm.agreements.getAgreement;
const listAgreementsByCustomerRef = anyApi.crm.agreements.listAgreementsByCustomer;

const modules = import.meta.glob("/convex/**/*.ts");

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

type TestT = ReturnType<typeof convexTest>;

async function createSession(
  t: TestT,
  role: "admin" | "manager" | "order_staff",
  name: string,
): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
  const token = `${role}-token-${Date.now()}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name,
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId: uid,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
    return uid as Id<"users">;
  });
  return { sessionId: token, userId };
}

/** Store a minimal blob via ctx.storage.store() and return its Id. */
async function createStorageId(t: TestT): Promise<Id<"_storage">> {
  // t.run ctx includes storage from GenericActionCtx.
  // jsdom's Blob lacks arrayBuffer(); polyfill it on the instance so convex-test
  // can compute the SHA-256 for the internal _storage record.
  return t.run(async (ctx) => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
    const blob = new Blob([bytes], { type: "application/pdf" });

    // jsdom Blob polyfill: add arrayBuffer() if missing.
    if (typeof (blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer !== "function") {
      (blob as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
        bytes.buffer as ArrayBuffer;
    }

    const storageCtx = ctx as unknown as {
      storage: { store: (b: Blob) => Promise<Id<"_storage">> };
    };
    return storageCtx.storage.store(blob);
  });
}

const SUB_DEFAULTS = {
  label: "Test Sub",
  billingModel: "prepaid_weekly_credit" as const,
  unitPrice: 29000,
  confidentialPrice: true,
  baselineDailyQty: 10,
  weeklyQty: 70,
  deliverByTime: "09:00",
  creditRolloverPolicy: "expire" as const,
  changeCutoffHour: 13,
  changeCutoffDayOffset: -1,
  permanentChangeNoticeDays: 14,
  terminationNoticeDays: 30,
  cogsBasis: 0,
  startDate: Date.now(),
  scheduleTemplate: [],
};

// ---------------------------------------------------------------------------
// generateAgreementUploadUrl
// ---------------------------------------------------------------------------

describe("generateAgreementUploadUrl", () => {
  it("manager gets a non-empty URL string", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Upload");

    const url = await t.mutation(generateAgreementUploadUrlRef, { sessionId });
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });

  it("admin gets a non-empty URL string", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "admin", "Admin Upload");

    const url = await t.mutation(generateAgreementUploadUrlRef, { sessionId });
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "order_staff", "Staff Upload");

    await expect(
      t.mutation(generateAgreementUploadUrlRef, { sessionId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// createSupplyAgreement
// ---------------------------------------------------------------------------

describe("createSupplyAgreement", () => {
  it("sets uploadedBy = ctx.user._id and seeds versions[0]", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Create");
    const fileStorageId = await createStorageId(t);
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Create", createdBy: "test" } as never),
    );

    const beforeMs = Date.now();
    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId,
      fileStorageId,
      fileName: "agreement-v1.pdf",
      fileSize: 204800,
      status: "draft",
      lang: "id",
    });

    const doc = await t.run(async (ctx) =>
      ctx.db.get(agreementId),
    ) as Doc<"supplyAgreements"> | null;
    expect(doc).not.toBeNull();
    expect(doc!.uploadedBy).toBe(userId);
    expect(doc!.uploadedAt).toBeGreaterThanOrEqual(beforeMs);
    expect(doc!.customerId).toBe(customerId);
    expect(doc!.status).toBe("draft");

    // Versions seeded with the initial file.
    expect(Array.isArray(doc!.versions)).toBe(true);
    expect(doc!.versions).toHaveLength(1);
    expect(doc!.versions![0].fileStorageId).toBe(fileStorageId);
    expect(doc!.versions![0].fileName).toBe("agreement-v1.pdf");
    expect(doc!.versions![0].lang).toBe("id");
  });

  it("optional fields (subscriptionId, signedDate, keyTerms) are stored when provided", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Optional");
    const fileStorageId = await createStorageId(t);
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Opts", createdBy: "test" } as never),
    );
    const subscriptionId = await t.run(async (ctx) =>
      ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId,
        status: "active",
        createdBy: userId,
      } as never),
    );

    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId,
      subscriptionId,
      fileStorageId,
      fileName: "agreement-signed.pdf",
      fileSize: 512000,
      status: "signed",
      signedDate: Date.now(),
      governingLaw: "Indonesian Law",
      lang: "en",
    });

    const doc = await t.run(async (ctx) =>
      ctx.db.get(agreementId),
    ) as Doc<"supplyAgreements"> | null;
    expect(doc!.subscriptionId).toBe(subscriptionId);
    expect(doc!.status).toBe("signed");
    expect(doc!.governingLaw).toBe("Indonesian Law");
    expect(doc!.versions![0].lang).toBe("en");
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "order_staff", "Staff Create");
    const fileStorageId = await createStorageId(t);
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Staff", createdBy: "test" } as never),
    );

    await expect(
      t.mutation(createSupplyAgreementRef, {
        sessionId,
        customerId,
        fileStorageId,
        fileName: "x.pdf",
        fileSize: 100,
        status: "draft",
        lang: "id",
      }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// addAgreementVersion
// ---------------------------------------------------------------------------

describe("addAgreementVersion", () => {
  it("appends a new version entry to versions[]", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr AddVer");
    const fileStorageId1 = await createStorageId(t);
    const fileStorageId2 = await createStorageId(t);
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe AddVer", createdBy: "test" } as never),
    );

    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId,
      fileStorageId: fileStorageId1,
      fileName: "v1.pdf",
      fileSize: 100,
      status: "draft",
      lang: "id",
    });

    await t.mutation(addAgreementVersionRef, {
      sessionId,
      agreementId,
      fileStorageId: fileStorageId2,
      fileName: "v2.pdf",
      lang: "en",
    });

    const doc = await t.run(async (ctx) =>
      ctx.db.get(agreementId),
    ) as Doc<"supplyAgreements"> | null;
    expect(doc!.versions).toHaveLength(2);
    expect(doc!.versions![0].fileName).toBe("v1.pdf");
    expect(doc!.versions![0].lang).toBe("id");
    expect(doc!.versions![1].fileName).toBe("v2.pdf");
    expect(doc!.versions![1].lang).toBe("en");
    expect(doc!.versions![1].fileStorageId).toBe(fileStorageId2);
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId: managerSession, userId } = await createSession(t, "manager", "Mgr For Staff2");
    const { sessionId: staffSession } = await createSession(t, "order_staff", "Staff AddVer");
    const fileStorageId = await createStorageId(t);
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe StaffVer", createdBy: "test" } as never),
    );
    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId: managerSession,
      customerId,
      fileStorageId,
      fileName: "v1.pdf",
      fileSize: 100,
      status: "draft",
      lang: "id",
    });

    await expect(
      t.mutation(addAgreementVersionRef, {
        sessionId: staffSession,
        agreementId,
        fileStorageId,
        fileName: "v2.pdf",
        lang: "en",
      }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// linkAgreementToSubscription
// ---------------------------------------------------------------------------

describe("linkAgreementToSubscription", () => {
  it("patches BOTH supplyAgreements.subscriptionId AND subscriptions.agreementId", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Link");
    const fileStorageId = await createStorageId(t);

    const { customerId, subscriptionId } = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe Link",
        createdBy: "test",
      } as never);
      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);
      return { customerId: cid, subscriptionId: sid };
    });

    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId,
      fileStorageId,
      fileName: "link-test.pdf",
      fileSize: 1024,
      status: "draft",
      lang: "id",
    });

    await t.mutation(linkAgreementToSubscriptionRef, {
      sessionId,
      agreementId,
      subscriptionId,
    });

    const [agDoc, subDoc] = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(agreementId), ctx.db.get(subscriptionId)]),
    ) as [Doc<"supplyAgreements"> | null, Doc<"subscriptions"> | null];

    expect(agDoc!.subscriptionId).toBe(subscriptionId);
    expect(subDoc!.agreementId).toBe(agreementId);
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId: managerSession, userId } = await createSession(t, "manager", "Mgr For Link");
    const { sessionId: staffSession } = await createSession(t, "order_staff", "Staff Link");
    const fileStorageId = await createStorageId(t);

    const { customerId, subscriptionId } = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe LinkStaff",
        createdBy: "test",
      } as never);
      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);
      return { customerId: cid, subscriptionId: sid };
    });

    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId: managerSession,
      customerId,
      fileStorageId,
      fileName: "link-staff.pdf",
      fileSize: 100,
      status: "draft",
      lang: "id",
    });

    await expect(
      t.mutation(linkAgreementToSubscriptionRef, {
        sessionId: staffSession,
        agreementId,
        subscriptionId,
      }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// getAgreement
// ---------------------------------------------------------------------------

describe("getAgreement", () => {
  it("returns the agreement doc for manager", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Get");
    const fileStorageId = await createStorageId(t);
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Get", createdBy: "test" } as never),
    );

    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId,
      fileStorageId,
      fileName: "get-test.pdf",
      fileSize: 2048,
      status: "signed",
      lang: "en",
    });

    const result = await t.query(getAgreementRef, { sessionId, agreementId });
    expect(result).not.toBeNull();
    expect(result!._id).toBe(agreementId);
    expect(result!.fileName).toBe("get-test.pdf");
    expect(result!.status).toBe("signed");
  });

  it("returns null for a deleted agreement", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "admin", "Admin Get");
    const fileStorageId = await createStorageId(t);
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe GetNull", createdBy: "test" } as never),
    );

    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId,
      fileStorageId,
      fileName: "gone.pdf",
      fileSize: 100,
      status: "draft",
      lang: "id",
    });
    await t.run(async (ctx) => ctx.db.delete(agreementId));

    const result = await t.query(getAgreementRef, { sessionId, agreementId });
    expect(result).toBeNull();
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId: managerSession, userId } = await createSession(t, "manager", "Mgr For Get");
    const { sessionId: staffSession } = await createSession(t, "order_staff", "Staff Get");
    const fileStorageId = await createStorageId(t);
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe GetStaff", createdBy: "test" } as never),
    );

    const agreementId = await t.mutation(createSupplyAgreementRef, {
      sessionId: managerSession,
      customerId,
      fileStorageId,
      fileName: "staff-get.pdf",
      fileSize: 100,
      status: "draft",
      lang: "id",
    });

    await expect(
      t.query(getAgreementRef, { sessionId: staffSession, agreementId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// listAgreementsByCustomer
// ---------------------------------------------------------------------------

describe("listAgreementsByCustomer", () => {
  it("returns all agreements for a customer via by_customer index", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr List");
    const fileStorageId1 = await createStorageId(t);
    const fileStorageId2 = await createStorageId(t);
    const otherStorageId = await createStorageId(t);

    const { targetCustomerId, otherCustomerId } = await t.run(async (ctx) => {
      const tc = await ctx.db.insert("customers", {
        name: "Cafe List Target",
        createdBy: "test",
      } as never);
      const oc = await ctx.db.insert("customers", {
        name: "Cafe List Other",
        createdBy: "test",
      } as never);
      return { targetCustomerId: tc, otherCustomerId: oc };
    });

    // Two agreements for target customer, one for other.
    const ag1 = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId: targetCustomerId,
      fileStorageId: fileStorageId1,
      fileName: "list-a.pdf",
      fileSize: 100,
      status: "draft",
      lang: "id",
    });
    const ag2 = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId: targetCustomerId,
      fileStorageId: fileStorageId2,
      fileName: "list-b.pdf",
      fileSize: 200,
      status: "signed",
      lang: "en",
    });
    const agOther = await t.mutation(createSupplyAgreementRef, {
      sessionId,
      customerId: otherCustomerId,
      fileStorageId: otherStorageId,
      fileName: "other.pdf",
      fileSize: 300,
      status: "draft",
      lang: "id",
    });

    const results = await t.query(listAgreementsByCustomerRef, {
      sessionId,
      customerId: targetCustomerId,
    });

    const ids = results.map((r: { _id: string }) => r._id);
    expect(ids).toContain(ag1);
    expect(ids).toContain(ag2);
    expect(ids).not.toContain(agOther);
    expect(results).toHaveLength(2);
  });

  it("returns empty array when customer has no agreements", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr ListEmpty");
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Empty", createdBy: "test" } as never),
    );

    const results = await t.query(listAgreementsByCustomerRef, {
      sessionId,
      customerId,
    });
    expect(results).toHaveLength(0);
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "order_staff", "Staff List");
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe StaffList", createdBy: "test" } as never),
    );

    await expect(
      t.query(listAgreementsByCustomerRef, { sessionId, customerId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});
