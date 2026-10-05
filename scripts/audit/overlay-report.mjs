// Turns qa/overlays/{before,after}/metrics.json into qa/overlays/REPORT.md: a pass/fail grid (overlay × viewport) and a
// failure tally. Usage: node scripts/audit/overlay-report.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { judge } = require('../../e2e/overlays/judge.js');
const { OVERLAYS } = require('../../e2e/overlays/registry.js');
const { VIEWPORTS } = require('../../e2e/overlays/viewports.js');

const load = (dir) => (fs.existsSync(`qa/overlays/${dir}/metrics.json`) ? JSON.parse(fs.readFileSync(`qa/overlays/${dir}/metrics.json`, 'utf8')) : null);
const before = load('before');
const after = load('after');

function grid(data, title) {
  const lines = [`### ${title}`, '', `| overlay | ${VIEWPORTS.map((v) => v.id.replace(/^[a-z]/, '')).join(' | ')} | fails |`, `|---|${VIEWPORTS.map(() => ':-:').join('|')}|--:|`];
  let total = 0;
  let failed = 0;
  for (const o of OVERLAYS) {
    let rowFails = 0;
    const cells = VIEWPORTS.map((v) => {
      const m = data[`${v.id}/${o.id}`];
      if (!m) return '·';
      total += 1;
      const f = judge(m);
      if (f.length) {
        failed += 1;
        rowFails += 1;
        return '✗';
      }
      return '✓';
    });
    lines.push(`| ${o.id} | ${cells.join(' | ')} | ${rowFails} |`);
  }
  lines.push('', `**${total - failed} / ${total} pass**`, '');
  return { text: lines.join('\n'), total, failed };
}

function tally(data) {
  const counts = {};
  for (const m of Object.values(data)) for (const f of judge(m)) counts[f] = (counts[f] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

const out = ['# Overlay report', '', `Viewports: ${VIEWPORTS.map((v) => v.id).join(', ')}. ✓ = passes every rule in \`e2e/overlays/judge.js\`; ✗ = at least one failure; · = not measured.`, ''];
for (const [name, data] of [['Before', before], ['After', after]]) {
  if (!data) continue;
  const g = grid(data, name);
  out.push(g.text, `Failure codes: ${tally(data).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`, '');
}
if (before && after) {
  out.push('## Before / after screenshots', '', '| overlay @ viewport | before | after |', '|---|---|---|');
  for (const key of ['p390x844/fishcard', 'p390x844/shop-fish', 'd1366x768/fishcard', 'd1366x768/shop-decor', 'l844x390/settings', 'd1366x768@150/fishcard'].filter((k) => before[k] && after[k])) {
    const f = key.replace('/', '__');
    out.push(`| ${key} | ![](before/${f}.png) | ![](after/${f}.png) |`);
  }
}
fs.writeFileSync('qa/overlays/REPORT.md', out.join('\n'));
console.log('wrote qa/overlays/REPORT.md');
