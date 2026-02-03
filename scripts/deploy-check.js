#!/usr/bin/env node

/**
 * Deployment Target Verification Script
 *
 * Verifies that you're deploying to the correct Convex environment before
 * running any deployment commands.
 *
 * Usage:
 *   npm run deploy:check     - Verify current target
 *   npm run deploy:safe      - Verify and deploy to correct environment
 *
 * Background:
 *   This script was created after a Sev-1 incident where deployments went to
 *   the wrong Convex environment. See:
 *   docs/reports/RCA-2026-02-03-convex-environment-confusion.md
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Configuration - Updated 2026-02-03 after production migration
const EXPECTED_DEPLOYMENT = 'prod:decisive-wombat-7';
const EXPECTED_URL = 'https://decisive-wombat-7.convex.cloud';
const VERCEL_APP = 'frollie-product.vercel.app';

// Colors for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(color, symbol, message) {
  console.log(`${colors[color]}${symbol}${colors.reset} ${message}`);
}

function logError(message) {
  log('red', '✖', message);
}

function logSuccess(message) {
  log('green', '✔', message);
}

function logWarning(message) {
  log('yellow', '⚠', message);
}

function logInfo(message) {
  log('blue', 'ℹ', message);
}

function readEnvFile() {
  const envPath = join(projectRoot, '.env.local');

  if (!existsSync(envPath)) {
    logError('.env.local not found!');
    process.exit(1);
  }

  const content = readFileSync(envPath, 'utf-8');
  const vars = {};

  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=');
        // Remove quotes and inline comments
        value = value.replace(/^["']|["']$/g, '').split('#')[0].trim();
        vars[key.trim()] = value;
      }
    }
  });

  return vars;
}

function checkDeploymentTarget() {
  console.log('\n' + colors.bold + '🔍 Convex Deployment Target Verification' + colors.reset + '\n');

  const env = readEnvFile();
  let hasErrors = false;

  // Check CONVEX_DEPLOYMENT
  const deployment = env.CONVEX_DEPLOYMENT;
  if (!deployment) {
    logError('CONVEX_DEPLOYMENT not set in .env.local');
    hasErrors = true;
  } else if (deployment !== EXPECTED_DEPLOYMENT) {
    logError(`CONVEX_DEPLOYMENT mismatch!`);
    logError(`  Expected: ${EXPECTED_DEPLOYMENT}`);
    logError(`  Found:    ${deployment}`);
    hasErrors = true;
  } else {
    logSuccess(`CONVEX_DEPLOYMENT: ${deployment}`);
  }

  // Check VITE_CONVEX_URL
  const url = env.VITE_CONVEX_URL;
  if (!url) {
    logError('VITE_CONVEX_URL not set in .env.local');
    hasErrors = true;
  } else if (url !== EXPECTED_URL) {
    logError(`VITE_CONVEX_URL mismatch!`);
    logError(`  Expected: ${EXPECTED_URL}`);
    logError(`  Found:    ${url}`);
    hasErrors = true;
  } else {
    logSuccess(`VITE_CONVEX_URL: ${url}`);
  }

  console.log('');

  // Summary
  if (hasErrors) {
    console.log(colors.red + colors.bold + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
    logError('Deployment target verification FAILED!');
    console.log('');
    logWarning('Your Vercel app (' + VERCEL_APP + ') expects:');
    logInfo(`  CONVEX_DEPLOYMENT: ${EXPECTED_DEPLOYMENT}`);
    logInfo(`  VITE_CONVEX_URL:   ${EXPECTED_URL}`);
    console.log('');
    logWarning('Please fix .env.local before deploying.');
    console.log(colors.red + colors.bold + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
    process.exit(1);
  } else {
    console.log(colors.green + colors.bold + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
    logSuccess('Deployment target verification PASSED!');
    console.log('');
    logInfo(`Target: decisive-wombat-7 (Production)`);
    logInfo(`Vercel: ${VERCEL_APP}`);
    console.log('');
    logSuccess('Safe to deploy with: npx convex deploy --yes');
    console.log(colors.green + colors.bold + '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + colors.reset);
  }

  return !hasErrors;
}

function deploy() {
  console.log('\n' + colors.blue + '🚀 Deploying to Convex...' + colors.reset + '\n');

  try {
    execSync('npx convex deploy --yes', {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    console.log('\n' + colors.green + colors.bold + '✔ Deployment successful!' + colors.reset + '\n');
  } catch (error) {
    console.log('\n' + colors.red + colors.bold + '✖ Deployment failed!' + colors.reset + '\n');
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);
const shouldDeploy = args.includes('--deploy');

const isValid = checkDeploymentTarget();

if (shouldDeploy && isValid) {
  deploy();
}
