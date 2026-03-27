#!/usr/bin/env node
/**
 * Finds the .nsis.zip + .sig from the Tauri build output,
 * generates latest.json, and uploads both to the GitHub Release.
 *
 * Required env vars: RELEASE_TAG, REPO_SLUG, GITHUB_TOKEN
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const tag = process.env.RELEASE_TAG;
const repo = process.env.REPO_SLUG;
if (!tag || !repo) {
  console.error("Missing RELEASE_TAG or REPO_SLUG env vars");
  process.exit(1);
}
const version = tag.replace(/^v/, "");

// Recursively find a file matching a pattern
function findFile(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, pattern);
      if (found) return found;
    } else if (entry.name.match(pattern)) {
      return full;
    }
  }
  return null;
}

const targetDir = path.join("src-tauri", "target", "release");
console.log("Searching for .nsis.zip in", targetDir, "...");

const nsisZipPath = findFile(targetDir, /\.nsis\.zip$/);
if (!nsisZipPath) {
  console.error("ERROR: No .nsis.zip found anywhere under " + targetDir);
  // List what IS in the bundle dir for debugging
  const bundleDir = path.join(targetDir, "bundle");
  if (fs.existsSync(bundleDir)) {
    console.log("Bundle directory contents:");
    function listDir(d, indent) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        console.log(indent + e.name + (e.isDirectory() ? "/" : ""));
        if (e.isDirectory()) listDir(path.join(d, e.name), indent + "  ");
      }
    }
    listDir(bundleDir, "  ");
  }
  process.exit(1);
}

console.log("Found:", nsisZipPath);

const sigPath = nsisZipPath + ".sig";
if (!fs.existsSync(sigPath)) {
  console.error("ERROR: Signature file not found at " + sigPath);
  process.exit(1);
}

// Upload .nsis.zip
const nsisZipName = path.basename(nsisZipPath);
console.log("Uploading " + nsisZipName + "...");
execFileSync("gh", ["release", "upload", tag, nsisZipPath, "--clobber"], {
  stdio: "inherit",
});

// Read signature and build latest.json
const signature = fs.readFileSync(sigPath, "utf8").trim();
const latest = {
  version: version,
  notes:
    "See https://github.com/" +
    repo +
    "/blob/main/CHANGELOG.md for details.",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: signature,
      url:
        "https://github.com/" +
        repo +
        "/releases/download/" +
        tag +
        "/" +
        nsisZipName,
    },
  },
};

const latestPath = path.join(process.cwd(), "latest.json");
fs.writeFileSync(latestPath, JSON.stringify(latest, null, 2));
console.log("Generated latest.json:");
console.log(JSON.stringify(latest, null, 2));

// Upload latest.json
console.log("Uploading latest.json...");
execFileSync("gh", ["release", "upload", tag, latestPath, "--clobber"], {
  stdio: "inherit",
});

console.log("Done! Updater artifacts uploaded successfully.");
