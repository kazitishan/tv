// Downloads the latest official uBlock Origin Chromium build into
// extensions/ublock-origin. Runs after `npm install` and when the app updates;
// skips if the latest version is already there. Pass --force to re-download.
// If GitHub can't be asked for the latest version, it keeps what's installed,
// or installs FALLBACK_VERSION if nothing is.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FALLBACK_VERSION = '1.76.0';
const LATEST_API = 'https://api.github.com/repos/gorhill/uBlock/releases/latest';
const DEST = path.join(__dirname, '..', 'extensions', 'ublock-origin');

const releaseUrl = (version) =>
  `https://github.com/gorhill/uBlock/releases/download/${version}/uBlock0_${version}.chromium.zip`;

/** The installed uBlock Origin version, or null if it isn't installed. */
function installedVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DEST, 'manifest.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

/** The latest stable release on GitHub: { version, url } of its Chromium zip. */
async function latestRelease() {
  const res = await fetch(LATEST_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'tv-app' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} ${res.statusText}`);
  const release = await res.json();
  const zip = release.assets?.find((asset) => /\.chromium\.zip$/.test(asset.name));
  if (!release.tag_name || !zip) throw new Error('the latest release has no Chromium build');
  return { version: release.tag_name, url: zip.browser_download_url };
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
  const force = process.argv.includes('--force');
  const installed = installedVersion();

  let release;
  try {
    release = await latestRelease();
  } catch (err) {
    if (installed && !force) {
      console.log(`Couldn't check for a newer uBlock Origin (${err.message}); keeping ${installed}.`);
      return;
    }
    release = { version: FALLBACK_VERSION, url: releaseUrl(FALLBACK_VERSION) };
  }

  if (!force && installed === release.version) {
    console.log(`uBlock Origin ${release.version} already installed.`);
    return;
  }

  console.log(`Downloading uBlock Origin ${release.version}...`);
  const res = await fetch(release.url);
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
    console.log(`uBlock Origin ${release.version} installed to ${path.relative(process.cwd(), DEST)}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((err) => {
    // Don't fail `npm install`; the app runs without the ad blocker.
    console.warn(`Could not install uBlock Origin: ${err.message}`);
  });
}

module.exports = { installedVersion, latestRelease };
