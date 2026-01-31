/**
 * Tag integration tests for Convex backend.
 * Tests default tag seeding and idempotency.
 */

import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

// ============================================
// Default Tag Seeding Tests (5 tests)
// ============================================

describe('Default Tag Seeding', () => {
  test('seedDefaults creates exactly 5 tags', async () => {
    const t = convexTest(schema);

    await t.mutation(api.tags.mutations.seedDefaults, {});

    const tags = await t.run(async (ctx) => {
      return await ctx.db.query('tags').collect();
    });

    expect(tags).toHaveLength(5);
  });

  test('seedDefaults creates Dubai-Snack tag', async () => {
    const t = convexTest(schema);

    await t.mutation(api.tags.mutations.seedDefaults, {});

    const dubaiSnackTag = await t.run(async (ctx) => {
      return await ctx.db
        .query('tags')
        .withIndex('by_name', (q) => q.eq('name', 'Dubai-Snack'))
        .first();
    });

    expect(dubaiSnackTag).toBeDefined();
    expect(dubaiSnackTag?.name).toBe('Dubai-Snack');
  });

  test('seedDefaults creates Extruded-Snack tag', async () => {
    const t = convexTest(schema);

    await t.mutation(api.tags.mutations.seedDefaults, {});

    const extrudedSnackTag = await t.run(async (ctx) => {
      return await ctx.db
        .query('tags')
        .withIndex('by_name', (q) => q.eq('name', 'Extruded-Snack'))
        .first();
    });

    expect(extrudedSnackTag).toBeDefined();
    expect(extrudedSnackTag?.name).toBe('Extruded-Snack');
  });

  test('seedDefaults creates Sachet tag', async () => {
    const t = convexTest(schema);

    await t.mutation(api.tags.mutations.seedDefaults, {});

    const sachetTag = await t.run(async (ctx) => {
      return await ctx.db
        .query('tags')
        .withIndex('by_name', (q) => q.eq('name', 'Sachet'))
        .first();
    });

    expect(sachetTag).toBeDefined();
    expect(sachetTag?.name).toBe('Sachet');
  });

  test('seedDefaults creates Pouch and Box tags', async () => {
    const t = convexTest(schema);

    await t.mutation(api.tags.mutations.seedDefaults, {});

    const pouchTag = await t.run(async (ctx) => {
      return await ctx.db
        .query('tags')
        .withIndex('by_name', (q) => q.eq('name', 'Pouch'))
        .first();
    });

    const boxTag = await t.run(async (ctx) => {
      return await ctx.db
        .query('tags')
        .withIndex('by_name', (q) => q.eq('name', 'Box'))
        .first();
    });

    expect(pouchTag).toBeDefined();
    expect(pouchTag?.name).toBe('Pouch');
    expect(boxTag).toBeDefined();
    expect(boxTag?.name).toBe('Box');
  });
});

// ============================================
// Idempotency Tests (3 tests)
// ============================================

describe('Tag Seeding Idempotency', () => {
  test('running seedDefaults twice does not create duplicates', async () => {
    const t = convexTest(schema);

    // First run
    await t.mutation(api.tags.mutations.seedDefaults, {});

    const tagsAfterFirst = await t.run(async (ctx) => {
      return await ctx.db.query('tags').collect();
    });
    expect(tagsAfterFirst).toHaveLength(5);

    // Second run
    await t.mutation(api.tags.mutations.seedDefaults, {});

    const tagsAfterSecond = await t.run(async (ctx) => {
      return await ctx.db.query('tags').collect();
    });

    // Should still be exactly 5 tags
    expect(tagsAfterSecond).toHaveLength(5);
  });

  test('running seedDefaults multiple times maintains exactly 5 tags', async () => {
    const t = convexTest(schema);

    // Run multiple times
    await t.mutation(api.tags.mutations.seedDefaults, {});
    await t.mutation(api.tags.mutations.seedDefaults, {});
    await t.mutation(api.tags.mutations.seedDefaults, {});
    await t.mutation(api.tags.mutations.seedDefaults, {});

    const tags = await t.run(async (ctx) => {
      return await ctx.db.query('tags').collect();
    });

    expect(tags).toHaveLength(5);
  });

  test('seedDefaults skips existing tags and creates only missing ones', async () => {
    const t = convexTest(schema);

    // Pre-create two tags
    await t.run(async (ctx) => {
      await ctx.db.insert('tags', { name: 'Dubai-Snack' });
      await ctx.db.insert('tags', { name: 'Box' });
    });

    const preExistingTags = await t.run(async (ctx) => {
      return await ctx.db.query('tags').collect();
    });
    expect(preExistingTags).toHaveLength(2);

    // Run seed - should create only 3 missing tags
    const result = await t.mutation(api.tags.mutations.seedDefaults, {});

    // Should report only 3 created
    expect(result.created).toHaveLength(3);
    expect(result.created).toContain('Extruded-Snack');
    expect(result.created).toContain('Sachet');
    expect(result.created).toContain('Pouch');
    expect(result.created).not.toContain('Dubai-Snack');
    expect(result.created).not.toContain('Box');

    // Total should be 5
    const allTags = await t.run(async (ctx) => {
      return await ctx.db.query('tags').collect();
    });
    expect(allTags).toHaveLength(5);
  });
});

// ============================================
// Tag CRUD Tests (supplementary)
// ============================================

describe('Tag CRUD Operations', () => {
  test('can create a custom tag', async () => {
    const t = convexTest(schema);

    const tagId = await t.mutation(api.tags.mutations.create, {
      name: 'Custom-Tag',
    });

    const tag = await t.run(async (ctx) => ctx.db.get(tagId));
    expect(tag?.name).toBe('Custom-Tag');
  });

  test('prevents duplicate tag names', async () => {
    const t = convexTest(schema);

    await t.mutation(api.tags.mutations.create, {
      name: 'Unique-Tag',
    });

    await expect(
      t.mutation(api.tags.mutations.create, { name: 'Unique-Tag' })
    ).rejects.toThrow('Tag "Unique-Tag" already exists');
  });

  test('can update tag name', async () => {
    const t = convexTest(schema);

    const tagId = await t.mutation(api.tags.mutations.create, {
      name: 'Original-Name',
    });

    await t.mutation(api.tags.mutations.update, {
      id: tagId,
      name: 'New-Name',
    });

    const tag = await t.run(async (ctx) => ctx.db.get(tagId));
    expect(tag?.name).toBe('New-Name');
  });

  test('can delete tag', async () => {
    const t = convexTest(schema);

    const tagId = await t.mutation(api.tags.mutations.create, {
      name: 'Deletable-Tag',
    });

    const result = await t.mutation(api.tags.mutations.remove, { id: tagId });
    expect(result).toBe(true);

    const tag = await t.run(async (ctx) => ctx.db.get(tagId));
    expect(tag).toBeNull();
  });
});
