// Information for the About popup: versions and the Wi-Fi network in use.
const { execFile } = require('child_process');
const path = require('path');
const { installedVersion } = require('../scripts/fetch-ublock.cjs');

const ROOT = path.join(__dirname, '..');

const run = (cmd, args, timeout = 15_000) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout));
    });
  });

/**
 * The Wi-Fi network the computer is on: { name } or { name: null } when it isn't
 * on Wi-Fi (or it can't tell).
 *
 * On a Mac this uses system_profiler, which still shows the network name on
 * macOS 14+, where `networksetup -getairportnetwork` and `ipconfig` hide it from
 * apps without Location Services access. It takes a few seconds.
 */
async function getWifi() {
  try {
    if (process.platform === 'darwin') {
      const profile = JSON.parse(await run('system_profiler', ['-json', 'SPAirPortDataType'], 30_000));
      for (const itf of profile.SPAirPortDataType?.[0]?.spairport_airport_interfaces ?? []) {
        const name = itf.spairport_current_network_information?._name;
        if (itf.spairport_status_information === 'spairport_status_connected' && name) return { name };
      }
    } else if (process.platform === 'win32') {
      const out = await run('netsh', ['wlan', 'show', 'interfaces']);
      const name = out.match(/^\s*SSID\s*:\s*(.+)$/m)?.[1]?.trim();
      if (name) return { name };
    } else {
      const out = await run('nmcli', ['-t', '-f', 'active,ssid', 'dev', 'wifi']);
      const name = out.split('\n').find((line) => line.startsWith('yes:'))?.slice(4);
      if (name) return { name };
    }
  } catch (err) {
    console.error('Couldn’t read the Wi-Fi network:', err.message);
  }
  return { name: null };
}

/** { version, commit, date, electron, ublock } — commit and date of the checked-out git commit. */
async function getAppInfo() {
  const { version } = require('../package.json');
  let commit = null;
  let date = null;
  try {
    [commit, date] = (await run('git', ['log', '-1', '--format=%h %cs'])).trim().split(' ');
  } catch {
    // not a git checkout
  }
  return { version, commit, date, electron: process.versions.electron, ublock: installedVersion() };
}

module.exports = { getWifi, getAppInfo };
