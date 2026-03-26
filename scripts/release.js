#!/usr/bin/env node
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const dryRun = process.argv.includes("--dry-run");

if (dryRun) {
  console.log("=== DRY RUN MODE ===\n");
}

function run(cmd, args, opts = {}) {
  console.log(`  $ ${cmd} ${args.join(" ")}`);
  if (dryRun && !opts.allowInDryRun) {
    console.log("  [dry-run] skipped");
    return "";
  }
  return execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });
}

// 1. Read last git tag
let lastTag = "";
try {
  lastTag = run("git", ["describe", "--tags", "--abbrev=0"], { allowInDryRun: true }).trim();
} catch {
  console.log("  No previous tags found. This will be the first release.\n");
}

// 2. Detect bump type from conventional commits
const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
let commits = "";
try {
  commits = run("git", ["log", range, "--pretty=format:%s"], { allowInDryRun: true });
} catch {
  commits = "";
}

const lines = commits.split("\n").filter(Boolean);
let bump = "patch"; // default

for (const line of lines) {
  if (line.includes("BREAKING CHANGE") || /^feat!/.test(line) || /^fix!/.test(line)) {
    bump = "major";
    break;
  }
  if (/^feat(\(.*?\))?:/.test(line)) {
    bump = "minor";
    // don't break — a later commit could be BREAKING
  }
}

// 3. Bump package.json version
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split(".").map(Number);

let newVersion;
switch (bump) {
  case "major":
    newVersion = `${major + 1}.0.0`;
    break;
  case "minor":
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case "patch":
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

console.log(`\nCurrent version: ${currentVersion}`);
console.log(`Detected bump:   ${bump} (from ${lines.length} commit(s))`);
console.log(`New version:     ${newVersion}\n`);

if (!dryRun) {
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log("  Updated package.json");
}

// 4. Generate changelog
console.log("\nGenerating changelog...");
run("npx", ["conventional-changelog", "-p", "angular", "-i", "CHANGELOG.md", "-s"]);

// 5. Sync version to other files
console.log("\nSyncing version to all files...");
run("node", ["scripts/sync-version.js"]);

// 6. Git add + commit
console.log("\nCommitting release...");
run("git", ["add", "-A"]);
run("git", ["commit", "-m", `chore: release v${newVersion}`]);

// 7. Tag
console.log("\nTagging...");
run("git", ["tag", `v${newVersion}`]);

// 8. Push
console.log("\nPushing...");
run("git", ["push"]);
run("git", ["push", "--tags"]);

console.log(`\n${dryRun ? "[dry-run] " : ""}Release v${newVersion} complete!`);
