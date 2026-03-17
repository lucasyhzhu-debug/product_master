#!/usr/bin/env node
/**
 * validate-docs-manifest.cjs
 *
 * Validates .planning/docs-manifest.json for internal consistency.
 * Checks: JSON structure, no duplicate IDs, required fields, docFile existence,
 * section coverage, and orphan mappings.
 *
 * Exit 0 = all pass, Exit 1 = any error.
 */

const fs = require("fs");
const path = require("path");

const MANIFEST_PATH = path.resolve(__dirname, "..", ".planning", "docs-manifest.json");

let errors = 0;
let warnings = 0;

function pass(msg) {
  console.log(`PASS  ${msg}`);
}

function fail(msg) {
  console.log(`FAIL  ${msg}`);
  errors++;
}

function warn(msg) {
  console.log(`WARN  ${msg}`);
  warnings++;
}

// -------------------------------------------------------------------------
// 1. Load and parse JSON
// -------------------------------------------------------------------------

let manifest;
try {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
  manifest = JSON.parse(raw);
  pass("JSON is valid");
} catch (err) {
  fail(`Cannot parse manifest: ${err.message}`);
  process.exit(1);
}

// -------------------------------------------------------------------------
// 2. Top-level structure
// -------------------------------------------------------------------------

if (typeof manifest.version !== "string" || manifest.version.length === 0) {
  fail("Missing or empty 'version' field");
} else {
  pass(`version: ${manifest.version}`);
}

if (!Array.isArray(manifest.mappings)) {
  fail("'mappings' must be an array");
  process.exit(1);
} else {
  pass(`mappings: ${manifest.mappings.length} entries`);
}

if (typeof manifest.guides !== "object" || manifest.guides === null || Array.isArray(manifest.guides)) {
  fail("'guides' must be an object");
  process.exit(1);
} else {
  pass(`guides: ${Object.keys(manifest.guides).length} guide(s)`);
}

// -------------------------------------------------------------------------
// 3. No duplicate mapping IDs
// -------------------------------------------------------------------------

const idSet = new Set();
const duplicateIds = [];
for (const m of manifest.mappings) {
  if (m.id && idSet.has(m.id)) {
    duplicateIds.push(m.id);
  }
  if (m.id) idSet.add(m.id);
}

if (duplicateIds.length > 0) {
  fail(`Duplicate mapping IDs: ${duplicateIds.join(", ")}`);
} else {
  pass("No duplicate mapping IDs");
}

// -------------------------------------------------------------------------
// 4. Valid mapping fields
// -------------------------------------------------------------------------

const REQUIRED_FIELDS = ["id", "sourceGlobs", "docFile", "guide", "section", "lastReviewedCommit"];
let fieldErrors = 0;

for (const m of manifest.mappings) {
  for (const field of REQUIRED_FIELDS) {
    if (field === "sourceGlobs") {
      if (!Array.isArray(m.sourceGlobs) || m.sourceGlobs.length === 0) {
        fail(`Mapping '${m.id || "unknown"}': sourceGlobs must be a non-empty array`);
        fieldErrors++;
      }
    } else {
      if (typeof m[field] !== "string" || m[field].length === 0) {
        fail(`Mapping '${m.id || "unknown"}': missing or empty '${field}'`);
        fieldErrors++;
      }
    }
  }
}

if (fieldErrors === 0) {
  pass("All mappings have required fields");
}

// -------------------------------------------------------------------------
// 5. docFile paths exist
// -------------------------------------------------------------------------

const projectRoot = path.resolve(__dirname, "..");
let docFileErrors = 0;

for (const m of manifest.mappings) {
  if (!m.docFile) continue;
  const absPath = path.resolve(projectRoot, m.docFile);
  if (!fs.existsSync(absPath)) {
    fail(`Mapping '${m.id}': docFile does not exist: ${m.docFile}`);
    docFileErrors++;
  }
}

if (docFileErrors === 0) {
  pass("All docFile paths exist");
}

// -------------------------------------------------------------------------
// 6. Section coverage
// -------------------------------------------------------------------------

let coverageErrors = 0;

for (const [guideId, guideConfig] of Object.entries(manifest.guides)) {
  const expectedSections = guideConfig.sections || [];
  for (const section of expectedSections) {
    const hasMapping = manifest.mappings.some(
      (m) => m.guide === guideId && m.section === section
    );
    if (!hasMapping) {
      fail(`Guide '${guideId}': section '${section}' has no mapping`);
      coverageErrors++;
    }
  }
}

if (coverageErrors === 0) {
  pass("All guide sections have mappings");
}

// -------------------------------------------------------------------------
// 7. Orphan check (warning only)
// -------------------------------------------------------------------------

for (const m of manifest.mappings) {
  const guideConfig = manifest.guides[m.guide];
  if (!guideConfig) {
    warn(`Mapping '${m.id}': guide '${m.guide}' not listed in guides object`);
    continue;
  }
  const sections = guideConfig.sections || [];
  if (!sections.includes(m.section)) {
    warn(`Mapping '${m.id}': section '${m.section}' not listed in guide '${m.guide}'`);
  }
}

// -------------------------------------------------------------------------
// Summary
// -------------------------------------------------------------------------

console.log("");
console.log(`Results: ${errors} error(s), ${warnings} warning(s)`);

if (errors > 0) {
  process.exit(1);
} else {
  console.log("All checks passed.");
  process.exit(0);
}
