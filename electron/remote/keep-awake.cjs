// Keeps the computer from going to sleep on its own while the remote server runs,
// so a phone can always turn the TV on. Plain Node has no power API, so this
// starts the system's own tool, which watches this process and stops blocking
// sleep when it exits (even if it's killed). On macOS and Linux the screen can
// still turn off (the TV app keeps it on while it runs, via powerSaveBlocker in
// main.cjs); on Windows it stays on too, because of Modern Standby (see below).
const { spawn } = require('child_process');

function command(pid) {
  if (process.platform === 'darwin') {
    // -i: no idle sleep; -w: until this process exits.
    return ['caffeinate', ['-i', '-w', String(pid)]];
  }
  if (process.platform === 'win32') {
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED, held by this
    // PowerShell until it exits. The display flag matters: most current laptops
    // use Modern Standby, which goes to sleep as soon as the screen turns off and
    // ignores ES_SYSTEM_REQUIRED, so with the TV app off the laptop would sleep
    // after the screen timeout and the phone could no longer turn it back on.
    const script = [
      `Add-Type -Namespace TV -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'`,
      `[TV.Power]::SetThreadExecutionState([uint32]2147483651) | Out-Null`,
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
