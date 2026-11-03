import { spawn } from 'node:child_process';
import { emitKeypressEvents } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { listAndroidDevices, listIosSimulators } from './device.mjs';

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));

// The watcher keeps running while a separate CLI process builds and launches the selected app.
export function startDevControls({
  input = process.stdin,
  output = process.stdout,
  host = process.platform,
  androidDevices = listAndroidDevices,
  iosDevices = listIosSimulators,
  launch = (platform, id) => spawn(process.execPath, [cli, platform, '--device', id], {
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: process.platform !== 'win32',
  }),
  selectAndroid = serial => { process.env.ANDROID_SERIAL = serial; },
  quit = () => process.emit('SIGINT'),
} = {}) {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) return () => {};
  const wasRaw = Boolean(input.isRaw);
  const wasPaused = input.isPaused();
  let menu;
  let digits = '';
  let child;
  let disposed = false;
  const print = text => output.write(`${text}\n`);
  const hint = () => print('\n[a] Android  [i] iOS simulator  [?] help  [Ctrl+C] quit');

  function choose(platform) {
    if (platform === 'ios' && host !== 'darwin') {
      print('iOS simulators require macOS with Xcode.');
      return;
    }
    try {
      const devices = platform === 'android'
        ? androidDevices().filter(device => device.state === 'device' || device.state === 'emulator')
          .map(device => ({ id: device.serial, label: `${device.serial} (${device.emulator ? 'emulator' : 'device'})` }))
        : iosDevices().map(device => ({ id: device.udid, label: `${device.name} — ${device.state} (${device.udid})` }));
      if (!devices.length) {
        print(platform === 'android'
          ? 'No Android device available. Start an emulator or connect and authorize a device, then press a again.'
          : 'No iPhone simulator available. Install a simulator runtime in Xcode.');
        return;
      }
      menu = { platform, devices };
      digits = '';
      print(`\nChoose ${platform} device (number + Enter; Esc cancels):`);
      devices.forEach((device, index) => print(`  ${index + 1}. ${device.label}`));
      output.write('> ');
    } catch (error) {
      print(`Device discovery failed: ${error.message}`);
    }
  }

  function keypress(text, key = {}) {
    if (key.ctrl && key.name === 'c') { quit(); return; }
    if (child) {
      if (['a', 'i'].includes(text?.toLowerCase())) print('An app build is already running. Wait for it to finish.');
      return;
    }
    if (menu) {
      if (key.name === 'escape') { menu = undefined; print('\nSelection cancelled.'); hint(); return; }
      if (key.name === 'backspace') {
        if (digits) { digits = digits.slice(0, -1); output.write('\b \b'); }
        return;
      }
      if (/^[0-9]$/.test(text ?? '')) {
        digits += text;
        output.write(text);
        return;
      }
      if (key.name !== 'return' && key.name !== 'enter') return;
      const device = menu.devices[Number(digits) - 1];
      if (!device || !digits) {
        print('\nInvalid number. Choose a listed device.');
        digits = '';
        output.write('> ');
        return;
      }
      const platform = menu.platform;
      menu = undefined;
      print(`\nPreparing, building and launching ${device.label}…`);
      try {
        if (platform === 'android') selectAndroid(device.id);
        const running = launch(platform, device.id);
        child = running;
        let finished = false;
        const done = message => {
          if (finished) return;
          finished = true;
          if (child === running) child = undefined;
          if (!disposed) { print(message); hint(); }
        };
        running.once('error', error => done(`Launch failed: ${error.message}`));
        running.once('exit', (code, signal) => done(code === 0
          ? 'App started. Hot reload is still running.'
          : `App command failed (${signal ?? code}). Hot reload is still running; press a/i to retry.`));
      } catch (error) {
        print(`Launch failed: ${error.message}`);
        hint();
      }
      return;
    }
    if (text?.toLowerCase() === 'a') choose('android');
    else if (text?.toLowerCase() === 'i') choose('ios');
    else if (text === '?') hint();
  }

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  input.on('keypress', keypress);
  hint();
  return () => {
    if (disposed) return;
    disposed = true;
    input.off('keypress', keypress);
    input.setRawMode(wasRaw);
    if (wasPaused) input.pause();
    if (child) {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {}
    }
  };
}
