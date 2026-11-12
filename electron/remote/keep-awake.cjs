// Keeps the computer from going to sleep on its own while the remote server runs,
// so a phone can always turn the TV on. Plain Node has no power API, so this
// starts the system's own tool, which watches this process and stops blocking
// sleep when it exits (even if it's killed). The screen can still turn off;
// the TV app keeps it on while it runs (powerSaveBlocker in main.cjs).
const { spawn } = require('child_process');

function command(pid) {
  if (process.platform === 'darwin') {
    // -i: no idle sleep; -w: until this process exits.
    return ['caffeinate', ['-i', '-w', String(pid)]];
  }
  if (process.platform === 'win32') {
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED, held by this PowerShell until it exits.
    const script = [
      `Add-Type -Namespace TV -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'`,
      `[TV.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null`,
      `Wait-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    ].join('; ');
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]];
  }
  // Linux with systemd.
  return [
    'systemd-inhibit',
    ['--what=idle:sleep', '--who=TV', '--why=TV remote is running', 'tail', `--pid=${pid}`, '-f', '/dev/null'],
  ];
}

function keepAwake() {
  const [cmd, args] = command(process.pid);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', (err) => console.warn(`Could not keep the computer awake (${cmd}):`, err.message));
    child.unref(); // don't keep this process alive for it
    process.on('exit', () => child.kill());
  } catch (err) {
    console.warn('Could not keep the computer awake:', err.message);
  }
}

module.exports = { keepAwake };
