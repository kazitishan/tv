// Downloads the official uBlock Origin Chromium build into extensions/ublock-origin.
// Runs after `npm install`; skips if the right version is already there.
// Pass --force to re-download.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = '1.75.4';
const URL = `https://github.com/gorhill/uBlock/releases/download/${VERSION}/uBlock0_${VERSION}.chromium.zip`;
const DEST = path.join(__dirname, '..', 'extensions', 'ublock-origin');

function installedVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DEST, 'manifest.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

function unzip(zipPath, outDir) {
  try {
    execFileSync('unzip', ['-q', zipPath, '-d', outDir], { stdio: 'ignore' });
  } catch {
    // Windows 10+ and macOS ship a tar (bsdtar) that can read zip files.
    execFileSync('tar', ['-xf', zipPath, '-C', outDir], { stdio: 'ignore' });
  }
}

async function main() {
  if (!process.argv.includes('--force') && installedVersion() === VERSION) {
    console.log(`uBlock Origin ${VERSION} already installed.`);
    return;
  }

  console.log(`Downloading uBlock Origin ${VERSION}...`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ublock-'));
  try {
    const zipPath = path.join(tmp, 'ublock.zip');
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir);
    unzip(zipPath, outDir);

    fs.rmSync(DEST, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(DEST), { recursive: true });
    fs.cpSync(path.join(outDir, 'uBlock0.chromium'), DEST, { recursive: true });
    console.log(`uBlock Origin ${VERSION} installed to ${path.relative(process.cwd(), DEST)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  // Don't fail `npm install`; the app runs without the ad blocker.
  console.warn(`Could not install uBlock Origin: ${err.message}`);
});
