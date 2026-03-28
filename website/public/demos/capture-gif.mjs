// Captures high-quality GIF from animated HTML demo using Playwright
// Usage: node capture-gif.mjs <demo-url> <output-name> [width] [height] [duration-ms] [fps]
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';

const [,, url, outputName, w = '520', h = '640', durationMs = '24000', fpsStr = '8'] = process.argv;

if (!url || !outputName) {
  console.error('Usage: node capture-gif.mjs <url> <output-name> [width] [height] [duration-ms] [fps]');
  process.exit(1);
}

const width = parseInt(w);
const height = parseInt(h);
const duration = parseInt(durationMs);
const fps = parseInt(fpsStr);
const interval = Math.round(1000 / fps);
const totalFrames = Math.round(duration / interval);

const framesDir = resolve(`./frames-${outputName}`);
const outputPath = resolve(`../screenshots/${outputName}.gif`);

// Clean up any previous frames
if (existsSync(framesDir)) rmSync(framesDir, { recursive: true });
mkdirSync(framesDir, { recursive: true });

console.log(`Capturing ${totalFrames} frames at ${fps}fps (${duration}ms) at ${width}x${height}`);
console.log(`URL: ${url}`);
console.log(`Output: ${outputPath}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height } });

await page.goto(url, { waitUntil: 'domcontentloaded' });
// Wait for fonts to load
await page.waitForTimeout(500);

// Capture frames
for (let i = 0; i < totalFrames; i++) {
  const padded = String(i).padStart(4, '0');
  await page.screenshot({
    path: join(framesDir, `frame-${padded}.png`),
    type: 'png',
  });
  if (i < totalFrames - 1) await page.waitForTimeout(interval);
  if (i % 10 === 0) console.log(`  Frame ${i + 1}/${totalFrames}`);
}

console.log(`Captured ${totalFrames} frames. Assembling GIF with ffmpeg...`);
await browser.close();

const inputPattern = join(framesDir, 'frame-%04d.png');
const palettePath = join(framesDir, 'palette.png');

// Generate optimal palette
execFileSync('ffmpeg', [
  '-y', '-framerate', String(fps),
  '-i', inputPattern,
  '-vf', 'palettegen=max_colors=128:stats_mode=diff',
  palettePath,
]);

// Create GIF using palette for high quality
execFileSync('ffmpeg', [
  '-y', '-framerate', String(fps),
  '-i', inputPattern,
  '-i', palettePath,
  '-lavfi', 'paletteuse=dither=bayer:bayer_scale=3',
  outputPath,
]);

const stats = statSync(outputPath);
console.log(`GIF created: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

// Cleanup frames
rmSync(framesDir, { recursive: true });
console.log('Done!');
