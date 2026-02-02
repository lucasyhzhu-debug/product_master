#!/usr/bin/env node

/**
 * Environment Switcher Script
 * Switches between testing and production Convex deployments
 *
 * Usage:
 *   node scripts/switch-env.js testing
 *   node scripts/switch-env.js production
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const envMap = {
  testing: '.env.local.testing',
  production: '.env.local.production',
  prod: '.env.local.production',
  test: '.env.local.testing',
};

const env = process.argv[2];

if (!env) {
  console.error('❌ Error: Environment name required');
  console.log('\nUsage:');
  console.log('  npm run env:testing   - Switch to testing environment');
  console.log('  npm run env:prod      - Switch to production environment');
  process.exit(1);
}

const envFile = envMap[env.toLowerCase()];

if (!envFile) {
  console.error(`❌ Error: Unknown environment "${env}"`);
  console.log('\nAvailable environments: testing, production');
  process.exit(1);
}

const sourcePath = join(ROOT_DIR, envFile);
const targetPath = join(ROOT_DIR, '.env.local');

if (!existsSync(sourcePath)) {
  console.error(`❌ Error: Environment file not found: ${envFile}`);
  process.exit(1);
}

try {
  const content = readFileSync(sourcePath, 'utf-8');
  writeFileSync(targetPath, content);

  // Extract deployment name from content
  const deploymentMatch = content.match(/CONVEX_DEPLOYMENT=(.+)/);
  const deployment = deploymentMatch ? deploymentMatch[1].trim() : 'unknown';

  console.log(`✅ Switched to ${env.toUpperCase()} environment`);
  console.log(`📦 Deployment: ${deployment}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Run: npx convex dev`);
  console.log(`  2. Run: npm run dev`);
} catch (error) {
  console.error(`❌ Error: Failed to switch environment`);
  console.error(error.message);
  process.exit(1);
}
