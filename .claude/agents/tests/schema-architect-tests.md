# Schema Architect Agent - Test Cases

## Test Case 1: Schema Review (Basic Functionality)

**Prompt:**
```
Review the orders table schema. Analyze its indexes and identify any optimization opportunities.
```

**Expected Behavior:**
- Agent reads `convex/schema.ts`
- Identifies the orders table and its 5 indexes
- Analyzes index coverage against common query patterns
- Notes the status workflow union type
- Produces a structured review with:
  - Current index analysis
  - Query pattern coverage assessment
  - Optimization recommendations (if any)
  - Denormalization assessment

---

## Test Case 2: New Feature Schema Design

**Prompt:**
```
Design a schema for tracking customer feedback ratings on orders.
Requirements:
- 1-5 star rating
- Optional text comment
- Timestamp when submitted
- Link to the order
- Track whether customer was prompted or submitted voluntarily
```

**Expected Behavior:**
- Agent proposes a new `orderRatings` table
- Uses type-safe union for rating values
- Includes proper indexes (by_order, by_rating for aggregation)
- Provides rationale for design choices
- Includes migration plan (new table, no data migration needed)
- Suggests query/mutation signatures
- ASCII diagram showing relationship to orders table

---

## Test Case 3: Migration Planning

**Prompt:**
```
Plan a migration to add a "priority" field to orders with values: normal, urgent, rush.
Existing orders should default to "normal". Consider backward compatibility.
```

**Expected Behavior:**
- Agent proposes adding `priority` field as optional initially
- Suggests type-safe union: `v.union(v.literal("normal"), v.literal("urgent"), v.literal("rush"))`
- Plans phased migration:
  1. Add optional field
  2. Backfill existing orders with "normal"
  3. Update mutations to require field
- Considers index impact (should by_status_priority be added?)
- Provides rollback strategy
- Notes query/mutation updates needed

---

## Test Case 4: Normalization Analysis

**Prompt:**
```
Analyze the denormalization in orderItems (productName, unitPrice, unitCost).
Is this denormalization still justified? What are the trade-offs?
```

**Expected Behavior:**
- Agent explains why these fields are denormalized (historical accuracy, no joins)
- Discusses trade-offs:
  - Pro: Fast reads, historical snapshots, no cascade issues
  - Con: Storage duplication, no automatic price updates
- Confirms this is intentional and appropriate for order history
- Does NOT recommend removing denormalization
- May suggest adding `menuProductId` index for lookup (if missing)

---

## Test Case 5: Boundary Test - Out of Scope Request

**Prompt:**
```
Write the React component for displaying order ratings.
```

**Expected Behavior:**
- Agent recognizes this is outside its scope
- Politely declines or redirects
- Suggests using react-ui-builder agent instead
- May offer to design the schema that the component would use

---

## Test Case 6: Complex Schema Design

**Prompt:**
```
Design a schema for a promotional campaign system with:
- Campaigns with start/end dates
- Multiple discount rules per campaign (buy X get Y, percentage off category)
- Usage tracking per campaign
- Integration with existing voucher system
```

**Expected Behavior:**
- Agent designs multi-table schema:
  - `campaigns` (parent)
  - `campaignRules` (child with rule types)
  - Updates to `vouchers` (link to campaign)
- Uses proper typing for rule configurations
- Includes comprehensive indexes
- Provides ASCII/mermaid diagram of relationships
- Detailed migration plan since it touches existing tables
- Breaking change analysis for voucher table modifications

---

## Test Case 7: Index Optimization

**Prompt:**
```
The kitchen view is slow when filtering orders by status and due date.
Review the orders table indexes and suggest optimizations.
```

**Expected Behavior:**
- Agent identifies existing `by_status_due_date` composite index
- Verifies index field order matches query pattern
- If issue persists, investigates:
  - Query using wrong index
  - Missing index on related tables (orderItems, orderItemProduction)
  - Over-fetching in query
- Provides specific recommendations
- Does not make changes (read-only analysis)

---

## Validation Criteria

| Test | Pass Criteria |
|------|---------------|
| 1 | Produces structured review with index analysis |
| 2 | Creates complete schema proposal with rationale and diagram |
| 3 | Plans phased migration with rollback strategy |
| 4 | Correctly assesses denormalization as appropriate |
| 5 | Redirects to appropriate agent |
| 6 | Handles multi-table design with relationships |
| 7 | Provides specific, actionable index recommendations |
