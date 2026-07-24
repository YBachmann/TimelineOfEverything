#!/usr/bin/env node
/**
 * PreToolUse (Bash|PowerShell) hook — design-doc nudge.
 *
 * Warns, WITHOUT blocking, when a `git commit` on a feature/* branch has changed
 * src/ but added/updated no docs/design/*.md anywhere on the branch. Whether a
 * feature warrants a design doc is a judgment call (see CLAUDE.md "Design docs"),
 * so this only reminds — it never blocks, and any error falls through to a silent
 * allow (exit 0) so it can never wedge a commit.
 *
 * Input: hook JSON on stdin ({ tool_input: { command }, cwd, ... }).
 * Output (only in the nag case): JSON with hookSpecificOutput.additionalContext
 * (reminder injected for the model) + a short systemMessage (shown to the user).
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }

  const cmd = input?.tool_input?.command ?? '';
  if (!/git\s+commit\b/.test(cmd)) return;   // only git commit ...
  if (/--amend/.test(cmd)) return;           // amending: don't re-nag

  const cwd = input.cwd || process.cwd();
  const git = (args) => {
    try {
      return execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { return ''; }
  };

  const branch = git('rev-parse --abbrev-ref HEAD');
  if (!/^feature\//.test(branch)) return;    // only feature branches

  // Files this commit adds: everything on the branch since it forked from main,
  // plus what's staged right now (base..HEAD is empty on a branch's first commit).
  const base = git('merge-base HEAD main') || git('merge-base HEAD origin/main');
  const files = new Set();
  const add = (out) => out.split('\n').map((s) => s.trim()).filter(Boolean).forEach((f) => files.add(f));
  if (base) add(git(`diff --name-only ${base}..HEAD`));
  add(git('diff --cached --name-only'));

  const list = [...files];
  const touchedSrc = list.some((f) => f.startsWith('src/'));
  const touchedDoc = list.some((f) => f.startsWith('docs/design/') && f.endsWith('.md'));
  if (!touchedSrc || touchedDoc) return;     // nothing to nag about

  const context =
    `Design-doc check: branch "${branch}" has changed src/ but adds/updates no ` +
    `docs/design/*.md. If this feature carries a non-obvious decision (a tradeoff, a ` +
    `rejected alternative, a non-trivial mechanism), add a docs/design/<topic>.md in the ` +
    `house style and an index + map row in DESIGN.md before committing (see CLAUDE.md ` +
    `"Design docs"). If it's a chore/data/trivial change, an inline DESIGN.md decision ` +
    `entry — or nothing — is fine; proceed with the commit.`;

  process.stdout.write(JSON.stringify({
    systemMessage: `⚠ ${branch}: src changed but no docs/design/*.md — consider a design doc (see CLAUDE.md).`,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context },
  }));
}

try { main(); } catch { /* never block a commit */ }
process.exit(0);
