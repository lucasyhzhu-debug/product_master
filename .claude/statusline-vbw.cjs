#!/usr/bin/env node
// GSD Status Line — Pure Node.js port of VBW 4-line dashboard
// L1: project/phase, L2: context, L3: usage+cache, L4: model/cost
// Cache: fast (5s), slow (60s), cost (per-render)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');

// --- ANSI Colors ---
const C = '\x1b[36m', G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m';
const M = '\x1b[35m'; // magenta for pace marker
const D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';

// --- Helpers ---
function progressBar(pct, width, pacePct) {
  let filled = Math.floor(pct * width / 100);
  if (filled > width) filled = width;
  if (pct > 0 && filled === 0) filled = 1;
  const empty = width - filled;
  let color;
  if (pct >= 80) color = R;
  else if (pct >= 50) color = Y;
  else color = G;

  // No pace marker requested — simple bar
  if (pacePct === undefined || pacePct === null || pacePct < 0) {
    return `${color}${'█'.repeat(filled)}${'░'.repeat(empty)}${X}`;
  }

  // Pace marker: ▎ at ideal-spend position
  // Filled portion PAST the pace line renders in magenta to show over-pace
  let markerPos = Math.floor(pacePct * width / 100);
  if (markerPos >= width) markerPos = width - 1;
  if (markerPos < 0) markerPos = 0;

  const OVER = M; // magenta for over-pace spending
  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i === markerPos) {
      // Pace marker — bright white version of underlying char (no gap)
      bar += (i < filled) ? `\x1b[97m█${X}` : `\x1b[97m░${X}`;
    } else if (i < filled) {
      // Filled: normal color if before pace, magenta if past pace
      bar += (i < markerPos) ? `${color}█${X}` : `${OVER}█${X}`;
    } else {
      // Empty
      bar += `${D}░${X}`;
    }
  }
  return bar;
}

function fmtTok(v) {
  if (v >= 1000000) {
    let d = Math.floor(v / 1000000);
    let r = Math.floor((v % 1000000 + 50000) / 100000);
    if (r >= 10) { d++; r = 0; }
    return `${d}.${r}M`;
  } else if (v >= 1000) {
    let d = Math.floor(v / 1000);
    let r = Math.floor((v % 1000 + 50) / 100);
    if (r >= 10) { d++; r = 0; }
    return `${d}.${r}K`;
  }
  return `${v}`;
}

function fmtCost(val) {
  const num = parseFloat(val) || 0;
  const whole = Math.floor(num);
  const cents = Math.round((num - whole) * 100);
  const totalCents = whole * 100 + cents;
  if (totalCents >= 10000) return `$${whole}`;
  if (totalCents >= 1000) return `$${whole}.${Math.floor(cents / 10)}`;
  return `$${whole}.${String(cents).padStart(2, '0')}`;
}

function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

function countdown(epoch) {
  if (!epoch || epoch <= 0) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = epoch - now;
  if (diff <= 0) return 'now';
  if (diff >= 86400) {
    const dd = Math.floor(diff / 86400);
    const hh = Math.floor((diff % 86400) / 3600);
    return `~${dd}d ${hh}h`;
  }
  const hh = Math.floor(diff / 3600);
  const mm = Math.floor((diff % 3600) / 60);
  return `~${hh}h${mm}m`;
}

function readFileOr(p, def) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return def; }
}

function parseJsonOr(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}

function execOr(cmd, def) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); } catch { return def; }
}

function cacheFresh(cf, ttlSec) {
  try {
    const stat = fs.statSync(cf);
    return (Date.now() - stat.mtimeMs) / 1000 <= ttlSec;
  } catch { return false; }
}

// --- Main ---
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    render(data);
  } catch {
    process.stdout.write('statusline parse error\n');
  }
});

function render(data) {
  // --- Parse input JSON ---
  const PCT = Math.floor(data.context_window?.used_percentage || 0);
  const REM = Math.floor(data.context_window?.remaining_percentage || 100);
  const IN_TOK = data.context_window?.current_usage?.input_tokens || 0;
  const OUT_TOK = data.context_window?.current_usage?.output_tokens || 0;
  const CACHE_W = data.context_window?.current_usage?.cache_creation_input_tokens || 0;
  const CACHE_R = data.context_window?.current_usage?.cache_read_input_tokens || 0;
  const CTX_SIZE = data.context_window?.context_window_size || 200000;
  const COST = data.cost?.total_cost_usd || 0;
  const DUR_MS = data.cost?.total_duration_ms || 0;
  const API_MS = data.cost?.total_api_duration_ms || 0;
  const ADDED = data.cost?.total_lines_added || 0;
  const REMOVED = data.cost?.total_lines_removed || 0;
  const MODEL = data.model?.display_name || 'Claude';
  const VER = data.version || '?';
  const SESSION_ID = data.session_id || '';

  const CTX_USED = IN_TOK + CACHE_W + CACHE_R;
  const TOTAL_INPUT = IN_TOK + CACHE_W + CACHE_R;
  const CACHE_HIT_PCT = TOTAL_INPUT > 0 ? Math.floor(CACHE_R * 100 / TOTAL_INPUT) : 0;
  const CACHE_COLOR = CACHE_HIT_PCT >= 70 ? G : CACHE_HIT_PCT >= 40 ? Y : R;

  // --- Cache paths ---
  const tmpDir = os.tmpdir();
  const FAST_CF = path.join(tmpDir, 'gsd-sl-fast.json');
  const SLOW_CF = path.join(tmpDir, 'gsd-sl-slow.json');
  const COST_CF = path.join(tmpDir, 'gsd-sl-cost.txt');

  // --- Pass session ID for task lookup ---
  global._sessionId = SESSION_ID;

  // --- Fast cache (5s TTL): GSD state + git ---
  let fastData;
  if (cacheFresh(FAST_CF, 5)) {
    fastData = parseJsonOr(FAST_CF, null);
  }
  if (!fastData) {
    fastData = collectFastData();
    try { fs.writeFileSync(FAST_CF, JSON.stringify(fastData)); } catch {}
  }

  // --- Slow cache (60s TTL): usage limits ---
  let slowData;
  if (cacheFresh(SLOW_CF, 60)) {
    slowData = parseJsonOr(SLOW_CF, null);
  }
  if (!slowData) {
    slowData = collectSlowData();
    try { fs.writeFileSync(SLOW_CF, JSON.stringify(slowData)); } catch {}
  }

  // --- Cost ledger tracking ---
  let prevCost = null;
  try { prevCost = parseFloat(fs.readFileSync(COST_CF, 'utf8').trim()); } catch {}
  try { fs.writeFileSync(COST_CF, String(COST)); } catch {}

  if (prevCost !== null && fs.existsSync('.planning')) {
    const deltaCents = Math.round((COST - prevCost) * 100);
    if (deltaCents > 0) {
      const ledgerFile = '.planning/.cost-ledger.json';
      let activeAgent = 'other';
      try { activeAgent = fs.readFileSync('.planning/.active-agent', 'utf8').trim() || 'other'; } catch {}
      let ledger = parseJsonOr(ledgerFile, {});
      ledger[activeAgent] = (ledger[activeAgent] || 0) + deltaCents;
      try { fs.writeFileSync(ledgerFile, JSON.stringify(ledger)); } catch {}
    }
  }

  // --- Build L1: Project line ---
  const { PH, TT, EF, MP, BR, PD, PT, PPD, QA, GH_URL, GIT_STAGED, GIT_MODIFIED, GIT_AHEAD, EXEC_STATUS, EXEC_WAVE, EXEC_TWAVES, EXEC_DONE, EXEC_TOTAL, EXEC_CURRENT, CURRENT_TASK, GSD_UPDATE } = fastData;

  let L1;
  if (EXEC_STATUS === 'running' && EXEC_TOTAL > 0) {
    const execPct = Math.floor(EXEC_DONE * 100 / EXEC_TOTAL);
    L1 = `${C}${B}[GSD]${X} Build: ${progressBar(execPct, 8)} ${EXEC_DONE}/${EXEC_TOTAL} plans`;
    if (EXEC_TWAVES > 1) L1 += ` ${D}│${X} Wave ${EXEC_WAVE}/${EXEC_TWAVES}`;
    if (EXEC_CURRENT) L1 += ` ${D}│${X} ${C}◆${X} ${EXEC_CURRENT}`;
  } else if (fs.existsSync('.planning')) {
    L1 = `${C}${B}[GSD]${X}`;
    if (TT > 0) L1 += ` Phase ${PH}/${TT}`; else L1 += ` Phase ${PH || '?'}`;
    if (PT > 0) L1 += ` ${D}│${X} Plans: ${PD}/${PT} (${PPD} this phase)`;
    L1 += ` ${D}│${X} Effort: ${EF} ${D}│${X} Model: ${MP}`;
    L1 += QA === 'pass' ? ` ${D}│${X} ${G}QA: pass${X}` : ` ${D}│${X} ${D}QA: --${X}`;
  } else {
    L1 = `${C}${B}[GSD]${X} ${D}no project${X}`;
  }

  if (BR) {
    if (GH_URL) {
      const ghName = path.basename(GH_URL);
      const ghBranchUrl = `${GH_URL}/tree/${BR}`;
      L1 += ` ${D}│${X} \x1b]8;;${ghBranchUrl}\x07${ghName}:${BR}\x1b]8;;\x07`;
    } else {
      L1 += ` ${D}│${X} ${BR}`;
    }
    let gitInd = '';
    if (GIT_STAGED > 0) gitInd += `${G}+${GIT_STAGED}${X}`;
    if (GIT_MODIFIED > 0) gitInd += `${Y}~${GIT_MODIFIED}${X}`;
    if (gitInd) L1 += ` ${D}Files:${X} ${gitInd}`;
    if (GIT_AHEAD > 0) L1 += ` ${D}Commits:${X} ${C}↑${GIT_AHEAD}${X}`;
    L1 += ` ${D}Diff:${X} ${G}+${ADDED}${X} ${R}-${REMOVED}${X}`;
  }

  // --- Append current task to L1 if active ---
  if (CURRENT_TASK) L1 += ` ${D}│${X} ${B}${CURRENT_TASK}${X}`;

  // --- Build L2: Context line ---
  const BC = PCT >= 90 ? R : PCT >= 70 ? Y : G;
  const FL = Math.floor(PCT * 20 / 100);
  const EM = 20 - FL;
  const CTX_BAR = `${BC}${'▓'.repeat(FL)}${'░'.repeat(EM)}${X}`;

  let L2 = `Context: ${CTX_BAR} ${BC}${PCT}%${X} ${fmtTok(CTX_USED)}/${fmtTok(CTX_SIZE)}`;
  L2 += ` ${D}│${X} Tokens: ${fmtTok(IN_TOK)} in  ${fmtTok(OUT_TOK)} out`;
  L2 += ` ${D}│${X} Prompt Cache: ${CACHE_COLOR}${CACHE_HIT_PCT}% hit${X} ${fmtTok(CACHE_W)} write ${fmtTok(CACHE_R)} read`;

  // --- Build L3: Usage limits line ---
  const { fivePct, fiveEpoch, weekPct, weekEpoch, sonnetPct, extraEnabled, extraPct, extraUsedC, extraLimitC, fetchOk } = slowData;
  let L3;
  if (fetchOk === 'ok') {
    // Pace markers: calculate ideal-spend % based on elapsed time in each window
    const nowSec = Math.floor(Date.now() / 1000);
    const FIVE_HR = 5 * 3600;   // 18000s session window
    const SEVEN_D = 7 * 86400;  // 604800s weekly window

    // Session pace: how far through the 5hr window are we?
    let fivePace = -1;
    if (fiveEpoch > 0) {
      const fiveElapsed = FIVE_HR - Math.max(0, fiveEpoch - nowSec);
      fivePace = Math.max(0, Math.min(100, Math.floor(fiveElapsed * 100 / FIVE_HR)));
    }

    // Weekly pace: how far through the 7-day window are we?
    let weekPace = -1;
    if (weekEpoch > 0) {
      const weekElapsed = SEVEN_D - Math.max(0, weekEpoch - nowSec);
      weekPace = Math.max(0, Math.min(100, Math.floor(weekElapsed * 100 / SEVEN_D)));
    }

    // Sonnet uses same weekly cycle
    const sonnetPace = weekPace;

    L3 = `Session: ${progressBar(fivePct, 20, fivePace)} ${fivePct}%`;
    const fiveRem = countdown(fiveEpoch);
    if (fiveRem) L3 += ` ${fiveRem}`;
    L3 += ` ${D}│${X} Weekly: ${progressBar(weekPct, 20, weekPace)} ${weekPct}%`;
    const weekRem = countdown(weekEpoch);
    if (weekRem) L3 += ` ${weekRem}`;
    if (sonnetPct >= 0) L3 += ` ${D}│${X} Sonnet: ${progressBar(sonnetPct, 20, sonnetPace)} ${sonnetPct}%`;
    if (extraEnabled && extraPct >= 0) {
      const extraUsedD = `${Math.floor(extraUsedC / 100)}.${String(extraUsedC % 100).padStart(2, '0')}`;
      const extraLimitD = `${Math.floor(extraLimitC / 100)}.${String(extraLimitC % 100).padStart(2, '0')}`;
      L3 += ` ${D}│${X} Extra: ${progressBar(extraPct, 20)} ${extraPct}% $${extraUsedD}/$${extraLimitD}`;
    }
  } else if (fetchOk === 'auth') {
    L3 = `${D}Limits: auth expired (run /login)${X}`;
  } else if (fetchOk === 'fail') {
    L3 = `${D}Limits: fetch failed (retry in 60s)${X}`;
  } else {
    L3 = `${D}Limits: N/A (using API key)${X}`;
  }

  // --- Build L4: Model/cost line ---
  let L4 = '';
  if (GSD_UPDATE) L4 += `${Y}⬆ /gsd:update${X} ${D}│${X} `;
  L4 += `Model: ${D}${MODEL}${X} ${D}│${X} Cost: ${fmtCost(COST)} ${D}│${X} Time: ${fmtDur(DUR_MS)} (API: ${fmtDur(API_MS)})`;
  L4 += ` ${D}│${X} ${D}CC ${VER}${X}`;

  // --- Output ---
  process.stdout.write(`${L1}\n${L2}\n${L3}\n${L4}\n`);
}

// --- Data collection functions ---

function collectFastData() {
  let PH = 0, TT = 0, EF = 'balanced', MP = 'quality';
  let PD = 0, PT = 0, PPD = 0, QA = '--', GH_URL = '';
  let BR = '', GIT_STAGED = 0, GIT_MODIFIED = 0, GIT_AHEAD = 0;
  let EXEC_STATUS = '', EXEC_WAVE = 0, EXEC_TWAVES = 0, EXEC_DONE = 0, EXEC_TOTAL = 0, EXEC_CURRENT = '';

  // GSD state
  const stateContent = readFileOr('.planning/STATE.md', '');
  if (stateContent) {
    const phaseMatch = stateContent.match(/^Phase:\s*(\d+)\s*(?:\/\s*(\d+))?/m);
    if (phaseMatch) {
      PH = parseInt(phaseMatch[1]) || 0;
      TT = parseInt(phaseMatch[2]) || 0;
    }
  }

  const config = parseJsonOr('.planning/config.json', null);
  if (config) {
    EF = config.effort || 'balanced';
    MP = config.model_profile || 'quality';
  }

  // Git info
  BR = execOr('git branch --show-current', '');
  if (BR) {
    let origin = execOr('git remote get-url origin', '');
    if (origin) {
      GH_URL = origin
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/\.git$/, '')
        .replace(/https:\/\/[^@]*@/, 'https://');
    }
    const stagedLines = execOr('git diff --cached --numstat', '');
    GIT_STAGED = stagedLines ? stagedLines.split('\n').filter(Boolean).length : 0;
    const modLines = execOr('git diff --numstat', '');
    GIT_MODIFIED = modLines ? modLines.split('\n').filter(Boolean).length : 0;
    GIT_AHEAD = parseInt(execOr('git rev-list --count @{u}..HEAD', '0')) || 0;
  }

  // Phase plans
  if (fs.existsSync('.planning/phases')) {
    try {
      const walkSync = (dir, pattern) => {
        let results = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) results.push(...walkSync(full, pattern));
          else if (entry.name.match(pattern)) results.push(full);
        }
        return results;
      };
      PT = walkSync('.planning/phases', /-PLAN\.md$/).length;
      PD = walkSync('.planning/phases', /-SUMMARY\.md$/).length;
      if (PH > 0) {
        const phPrefix = String(PH).padStart(2, '0');
        const phaseDirs = fs.readdirSync('.planning/phases', { withFileTypes: true })
          .filter(e => e.isDirectory() && e.name.startsWith(phPrefix + '-'));
        if (phaseDirs.length > 0) {
          const pDir = path.join('.planning/phases', phaseDirs[0].name);
          PPD = walkSync(pDir, /-SUMMARY\.md$/).length;
          if (walkSync(pDir, /VERIFICATION\.md$/).length > 0) QA = 'pass';
        }
      }
    } catch {}
  }

  // Execution state
  const execState = parseJsonOr('.planning/.execution-state.json', null);
  if (execState) {
    EXEC_STATUS = execState.status || '';
    EXEC_WAVE = execState.wave || 0;
    EXEC_TWAVES = execState.total_waves || 0;
    const plans = execState.plans || [];
    EXEC_TOTAL = plans.length;
    EXEC_DONE = plans.filter(p => p.status === 'complete').length;
    const running = plans.find(p => p.status === 'running');
    EXEC_CURRENT = running?.title || '';
  }

  // Current task from todos (merged from gsd-statusline.js)
  let CURRENT_TASK = '';
  const homeDir = os.homedir();
  const todosDir = path.join(homeDir, '.claude', 'todos');
  // SESSION_ID is passed in from render() — store globally for collectFastData
  if (global._sessionId && fs.existsSync(todosDir)) {
    try {
      const files = fs.readdirSync(todosDir)
        .filter(f => f.startsWith(global._sessionId) && f.includes('-agent-') && f.endsWith('.json'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) {
        const todos = parseJsonOr(path.join(todosDir, files[0].name), []);
        const inProgress = todos.find(t => t.status === 'in_progress');
        if (inProgress) CURRENT_TASK = inProgress.activeForm || '';
      }
    } catch {}
  }

  // GSD update available (merged from gsd-statusline.js)
  let GSD_UPDATE = false;
  const cacheFile = path.join(homeDir, '.claude', 'cache', 'gsd-update-check.json');
  if (fs.existsSync(cacheFile)) {
    try {
      const cache = parseJsonOr(cacheFile, {});
      if (cache.update_available) GSD_UPDATE = true;
    } catch {}
  }

  return { PH, TT, EF, MP, BR, PD, PT, PPD, QA, GH_URL, GIT_STAGED, GIT_MODIFIED, GIT_AHEAD, EXEC_STATUS, EXEC_WAVE, EXEC_TWAVES, EXEC_DONE, EXEC_TOTAL, EXEC_CURRENT, CURRENT_TASK, GSD_UPDATE };
}

function collectSlowData() {
  let fivePct = 0, fiveEpoch = 0, weekPct = 0, weekEpoch = 0, sonnetPct = -1;
  let extraEnabled = false, extraPct = -1, extraUsedC = 0, extraLimitC = 0;
  let fetchOk = 'noauth';

  // Read OAuth token
  const credFile = path.join(os.homedir(), '.claude', '.credentials.json');
  const creds = parseJsonOr(credFile, null);
  const token = creds?.claudeAiOauth?.accessToken;

  if (token) {
    try {
      const result = execSync(
        `curl -s --max-time 3 -H "Authorization: Bearer ${token}" -H "anthropic-beta: oauth-2025-04-20" "https://api.anthropic.com/api/oauth/usage"`,
        { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const usage = JSON.parse(result);
      if (usage.five_hour) {
        fivePct = Math.floor(usage.five_hour?.utilization || 0);
        fiveEpoch = parseEpoch(usage.five_hour?.resets_at);
        weekPct = Math.floor(usage.seven_day?.utilization || 0);
        weekEpoch = parseEpoch(usage.seven_day?.resets_at);
        sonnetPct = usage.seven_day_sonnet ? Math.floor(usage.seven_day_sonnet.utilization || 0) : -1;
        extraEnabled = usage.extra_usage?.is_enabled === true;
        extraPct = usage.extra_usage ? Math.floor(usage.extra_usage.utilization || 0) : -1;
        extraUsedC = Math.floor(usage.extra_usage?.used_credits || 0);
        extraLimitC = Math.floor(usage.extra_usage?.monthly_limit || 0);
        fetchOk = 'ok';
      } else {
        fetchOk = 'fail';
      }
    } catch {
      fetchOk = 'fail';
    }
  }

  return { fivePct, fiveEpoch, weekPct, weekEpoch, sonnetPct, extraEnabled, extraPct, extraUsedC, extraLimitC, fetchOk };
}

function parseEpoch(isoStr) {
  if (!isoStr) return 0;
  try { return Math.floor(new Date(isoStr).getTime() / 1000); } catch { return 0; }
}
