/**
 * Model Profiles — Agent → profile → model alias mapping.
 *
 * Source of truth: .claude/get-shit-done/references/model-profiles.md
 *
 * Exports:
 *  - MODEL_PROFILES: { [agent]: { [profile]: alias } }
 *  - VALID_PROFILES: string[]
 *  - getAgentToModelMapForProfile(profile): { [agent]: alias }
 *  - formatAgentToModelMapAsTable(map): string
 */

const MODEL_PROFILES = {
  'gsd-planner':              { quality: 'opus',   balanced: 'opus',   budget: 'sonnet', adaptive: 'opus',   inherit: 'inherit' },
  'gsd-roadmapper':           { quality: 'opus',   balanced: 'sonnet', budget: 'sonnet', adaptive: 'sonnet', inherit: 'inherit' },
  'gsd-executor':             { quality: 'opus',   balanced: 'sonnet', budget: 'sonnet', adaptive: 'sonnet', inherit: 'inherit' },
  'gsd-phase-researcher':     { quality: 'opus',   balanced: 'sonnet', budget: 'haiku',  adaptive: 'sonnet', inherit: 'inherit' },
  'gsd-project-researcher':   { quality: 'opus',   balanced: 'sonnet', budget: 'haiku',  adaptive: 'sonnet', inherit: 'inherit' },
  'gsd-research-synthesizer': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku',  adaptive: 'haiku',  inherit: 'inherit' },
  'gsd-debugger':             { quality: 'opus',   balanced: 'sonnet', budget: 'sonnet', adaptive: 'opus',   inherit: 'inherit' },
  'gsd-codebase-mapper':      { quality: 'sonnet', balanced: 'haiku',  budget: 'haiku',  adaptive: 'haiku',  inherit: 'inherit' },
  'gsd-verifier':             { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku',  adaptive: 'sonnet', inherit: 'inherit' },
  'gsd-plan-checker':         { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku',  adaptive: 'haiku',  inherit: 'inherit' },
  'gsd-integration-checker':  { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku',  adaptive: 'haiku',  inherit: 'inherit' },
  'gsd-nyquist-auditor':      { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku',  adaptive: 'haiku',  inherit: 'inherit' },
};

const VALID_PROFILES = ['quality', 'balanced', 'budget', 'adaptive', 'inherit'];

function getAgentToModelMapForProfile(profile) {
  const normalized = String(profile || 'balanced').toLowerCase();
  const out = {};
  for (const agent of Object.keys(MODEL_PROFILES)) {
    const perProfile = MODEL_PROFILES[agent];
    out[agent] = perProfile[normalized] || perProfile.balanced || 'sonnet';
  }
  return out;
}

function formatAgentToModelMapAsTable(agentToModelMap) {
  const entries = Object.entries(agentToModelMap);
  const agentColWidth = Math.max(5, ...entries.map(([a]) => a.length));
  const modelColWidth = Math.max(5, ...entries.map(([, m]) => String(m).length));
  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
  const header = `| ${pad('Agent', agentColWidth)} | ${pad('Model', modelColWidth)} |`;
  const sep    = `|${'-'.repeat(agentColWidth + 2)}|${'-'.repeat(modelColWidth + 2)}|`;
  const rows = entries.map(([a, m]) => `| ${pad(a, agentColWidth)} | ${pad(String(m), modelColWidth)} |`);
  return [header, sep, ...rows].join('\n');
}

module.exports = {
  MODEL_PROFILES,
  VALID_PROFILES,
  getAgentToModelMapForProfile,
  formatAgentToModelMapAsTable,
};
