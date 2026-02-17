#!/usr/bin/env node
// Node.js shim: pipes stdin JSON to bash statusline script and returns stdout
const { execSync } = require('child_process');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const scriptPath = path.join(__dirname, 'statusline-vbw.sh').replace(/\\/g, '/');
    const result = execSync(`bash "${scriptPath}"`, {
      input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: '/c/Users/Irfan/AppData/Local/Microsoft/WinGet/Links:' + (process.env.PATH || '')
      }
    });
    process.stdout.write(result);
  } catch (e) {
    // Fallback: show minimal info if bash fails
    try {
      const data = JSON.parse(input);
      const model = data.model?.display_name || 'Claude';
      const pct = Math.round(data.context_window?.used_percentage || 0);
      const cost = (data.cost?.total_cost_usd || 0).toFixed(2);
      process.stdout.write(`${model} | Context: ${pct}% | Cost: $${cost}\n`);
    } catch {
      process.stdout.write('statusline error\n');
    }
  }
});
