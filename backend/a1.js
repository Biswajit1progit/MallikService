import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");
const root = process.cwd();
const sh = (c) => execSync(c, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let prefix, tracked;
try {
  prefix = sh("git rev-parse --show-prefix").trim();
  tracked = sh("git ls-files --full-name -- .").split("\n").filter(Boolean).map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p));
} catch {
  console.log("Run this inside your project folder (it must be a git repository).");
  process.exit(1);
}
const byLower = new Map(tracked.map((t) => [t.toLowerCase(), t]));
const isCode = (t) => /\.(js|mjs|cjs)$/.test(t) && !t.startsWith("node_modules/");
const code = tracked.filter(isCode);
const re = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
const resolveSpelling = (file, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));

// 1. which spellings are used for each file?
const uses = new Map(); // lowercase path -> Map(spelling -> count)
for (const file of code) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const m of text.matchAll(re)) {
    const spelling = resolveSpelling(file, m[1]);
    const key = spelling.toLowerCase();
    if (!byLower.has(key)) continue;
    if (!uses.has(key)) uses.set(key, new Map());
    uses.get(key).set(spelling, (uses.get(key).get(spelling) || 0) + 1);
  }
}

// 2. decide the one correct spelling for each file
const canonical = new Map(); // lowercase path -> chosen spelling
const renames = []; // {from, to}
const manual = [];
for (const [key, spellings] of uses) {
  const actual = byLower.get(key);
  let chosen = actual;
  if (!spellings.has(actual)) chosen = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
  canonical.set(key, chosen);
  if (chosen !== actual) {
    if (path.posix.dirname(chosen) !== path.posix.dirname(actual)) manual.push({ actual, chosen });
    else renames.push({ from: actual, to: chosen });
  }
}
for (const m of manual) canonical.set(m.actual.toLowerCase(), m.actual);

// 3. plan the import fixes (using the file's NEW path if it is renamed)
const newPathOf = (f) => renames.find((r) => r.from === f)?.to || f;
let importFixes = 0;
const plan = [];
for (const file of code) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const nf = newPathOf(file);
  let changed = false;
  const out = text.replace(re, (full, spec) => {
    const spelling = resolveSpelling(file, spec);
    const key = spelling.toLowerCase();
    const want = canonical.get(key);
    if (!want || want === spelling) return full;
    let rel = path.posix.relative(path.posix.dirname(nf), want);
    if (!rel.startsWith(".")) rel = "./" + rel;
    changed = true;
    importFixes++;
    return full.replace(spec, rel);
  });
  if (changed) plan.push({ file, out });
}

console.log(APPLY ? "APPLYING:\n" : "DRY RUN (nothing is changed yet):\n");
console.log(`Files to rename: ${renames.length}`);
for (const r of renames) console.log(`   ${r.from}  ->  ${r.to}`);
console.log(`Import lines to correct: ${importFixes} (in ${plan.length} file(s))`);
for (const p of plan) console.log(`   ${p.file}`);
for (const m of manual) console.log(`\nDO BY HAND (folder name differs): ${m.actual} should be ${m.chosen}`);

if (!APPLY) {
  console.log(renames.length || importFixes ? "\nLooks right? Run again with --apply" : "\nNothing to fix.");
  process.exit(0);
}

// 4. do it: rename in two steps (the only way git notices a capital-only change on Windows)
for (const r of renames) {
  const tmp = `${r.from}.casefix-tmp`;
  sh(`git mv "${r.from}" "${tmp}"`);
  sh(`git mv "${tmp}" "${r.to}"`);
}
for (const p of plan) fs.writeFileSync(path.join(root, newPathOf(p.file)), p.out);
console.log("\nDone. Now run:  node check-imports.mjs   then   git add -A   and commit + push.");
