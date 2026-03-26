#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Read version from package.json (single source of truth)
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

console.log(`Syncing version ${version} (build date: ${today}) to all files...`);

// 1. Update src/lib/version.ts
const versionTsPath = join(root, "src", "lib", "version.ts");
let versionTs = readFileSync(versionTsPath, "utf8");
versionTs = versionTs.replace(
  /export const NEXQ_VERSION = ".*?";/,
  `export const NEXQ_VERSION = "${version}";`
);
versionTs = versionTs.replace(
  /export const NEXQ_BUILD_DATE = ".*?";/,
  `export const NEXQ_BUILD_DATE = "${today}";`
);
writeFileSync(versionTsPath, versionTs);
console.log(`  Updated src/lib/version.ts`);

// 2. Update src-tauri/tauri.conf.json
const tauriConfPath = join(root, "src-tauri", "tauri.conf.json");
let tauriConf = readFileSync(tauriConfPath, "utf8");
tauriConf = tauriConf.replace(
  /"version": ".*?"/,
  `"version": "${version}"`
);
writeFileSync(tauriConfPath, tauriConf);
console.log(`  Updated src-tauri/tauri.conf.json`);

// 3. Update src-tauri/Cargo.toml
const cargoTomlPath = join(root, "src-tauri", "Cargo.toml");
let cargoToml = readFileSync(cargoTomlPath, "utf8");
cargoToml = cargoToml.replace(
  /^(version = )".*?"/m,
  `$1"${version}"`
);
writeFileSync(cargoTomlPath, cargoToml);
console.log(`  Updated src-tauri/Cargo.toml`);

console.log(`\nVersion sync complete.`);
