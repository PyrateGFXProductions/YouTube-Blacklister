/*
 * Shell-script structural gate.
 *
 * package-extension.ps1 is covered by NO other test in `npm test`, and a green JS suite cannot
 * vouch for it — an unbalanced delimiter or an unpaired here-string ships silently, and the
 * packager is the one script whose failure means no release is produced at all.
 *
 * It covers the scripts that ARE TRACKED. The repo-only installers (install.bat,
 * fix-zen-install.*) are deliberately untracked and are NOT required here: a fresh clone does
 * not have them, so demanding them would fail the suite on every machine but this one. The
 * batch-specific checks below still exist and run if a .bat is ever tracked again.
 *
 * This is a STRUCTURAL check, not a parser run. It proves the scripts are well-formed; it
 * does not prove they run.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const results = [];
const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || '' });

// Strip comments and quoted literals so delimiter counts reflect real structure.
function stripPs(src) {
  return src
    .replace(/<#[\s\S]*?#>/g, '')
    .replace(/#.*/g, '')
    .replace(/@".*?"@/gs, '""')
    .replace(/@'.*?'@/gs, "''")
    .replace(/"(?:[^"`]|`.)*"/g, '""')
    .replace(/'(?:[^']|'')*'/g, "''");
}

function checkPs1(file) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) { ok(`${file}: present`, false, 'file not found'); return; }
  const src = fs.readFileSync(p, 'utf8');
  const s = stripPs(src);
  const bad = [];
  for (const [name, o, c] of [['braces', '{', '}'], ['parens', '(', ')'], ['brackets', '[', ']']]) {
    if (s.split(o).length !== s.split(c).length) {
      bad.push(`${name} unbalanced (${s.split(o).length - 1} open vs ${s.split(c).length - 1} close)`);
    }
  }
  if ((s.split('@"').length - 1 + s.split("@'").length - 1) !== (s.split('"@').length - 1 + s.split("'@").length - 1)) {
    bad.push('here-string delimiters unpaired');
  }
  if (/@'[\s\S]*?\$/.test(src)) bad.push('single-quoted here-string contains a $variable (will not expand)');
  ok(`${file}: structurally sound (delimiters + here-strings)`, bad.length === 0, bad.join('; '));
}

function checkBat(file) {
  const p = path.join(REPO, file);
  if (!fs.existsSync(p)) { ok(`${file}: present`, false, 'file not found'); return; }
  const raw = fs.readFileSync(p);
  const src = raw.toString('utf8');
  const bad = [];

  // Quote balance per line: cmd.exe parses quotes line by line.
  src.split(/\r?\n/).forEach((line, i) => {
    if ((line.match(/"/g) || []).length % 2 !== 0) bad.push(`unbalanced quote on line ${i + 1}`);
  });

  // Every stage banner must agree on the total, and run 1..n in order.
  const stages = [...src.matchAll(/\[(\d+)\/(\d+)\]/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (stages.length) {
    const totals = new Set(stages.map(s => s[1]));
    const nums = stages.map(s => s[0]);
    if (totals.size !== 1 || nums.join(',') !== nums.map((_, i) => i + 1).join(',')) {
      bad.push(`stage banners inconsistent: ${JSON.stringify(stages)}`);
    }
  }

  // A "Final N <noun>" label must match the numbered steps beneath it — the exact defect
  // this gate was written for ("Final 2 Quick Steps" over a 1,2,3 list).
  const label = src.match(/Final (\d+) ([A-Za-z ]+?):/);
  if (label) {
    const declared = Number(label[1]);
    const after = src.slice(src.indexOf(label[0]));
    const steps = [...after.matchAll(/^\s*echo\s+(\d+)\.\s/gm)].map(m => Number(m[1]));
    if (steps.length && declared !== steps.length) {
      bad.push(`"Final ${declared} ..." label disagrees with its ${steps.length} numbered step(s)`);
    }
  }

  // Bare-LF is only a hazard for constructs cmd.exe parses across lines.
  const crlf = (raw.toString('binary').match(/\r\n/g) || []).length;
  const lf = (raw.toString('binary').match(/\n/g) || []).length;
  if (lf > 0 && crlf === 0) {
    const risky = /^\s*goto\b|^\s*:[A-Za-z_]|^\s*\(/m.test(src);
    if (risky) bad.push('bare-LF endings with line-sensitive constructs (goto/label/block)');
  }

  ok(`${file}: structurally sound (quotes, stage banners, step labels)`, bad.length === 0, bad.join('; '));
}

// The TRACKED scripts this gate owns. Every entry must be tracked, or a fresh clone fails the
// suite — which is exactly the bug this list used to have (it required install.bat and
// fix-zen-install.*, which are no longer tracked).
const TRACKED_PS1 = ['package-extension.ps1'];
const TRACKED_BAT = [];
for (const f of TRACKED_PS1) checkPs1(f);
for (const f of TRACKED_BAT) checkBat(f);

let fail = 0;
for (const r of results) {
  if (!r.pass) fail++;
  console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.pass || !r.detail ? '' : '  — ' + r.detail));
}
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
