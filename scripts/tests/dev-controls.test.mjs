import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { startDevControls } from '../dev-controls.mjs';

function harness(overrides = {}) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = raw => { input.isRaw = raw; };
  let text = '';
  const output = { isTTY: true, write: value => { text += value; } };
  const launched = [];
  const selected = [];
  const child = new EventEmitter();
  let killed = false;
  child.kill = () => { killed = true; };
  let quit = false;
  const stop = startDevControls({
    input, output, host: 'darwin',
    androidDevices: () => [
      { serial: 'unauthorized-phone', state: 'unauthorized', emulator: false },
      { serial: 'emulator-5554', state: 'device', emulator: true },
      { serial: 'phone-123', state: 'device', emulator: false },
    ],
    iosDevices: () => [{ udid: 'sim-1', name: 'Test iPhone', state: 'Shutdown' }],
    launch: (...args) => { launched.push(args); return child; },
    selectAndroid: serial => selected.push(serial),
    quit: () => { quit = true; },
    ...overrides,
  });
  const key = (text, key = {}) => input.emit('keypress', text, key);
  return { input, stop, key, launched, selected, child,
    text: () => text, killed: () => killed, quit: () => quit };
}

test('Android selection requires confirmation and targets the selected phone for hot reload', () => {
  const h = harness();
  try {
    h.key('A');
    assert.doesNotMatch(h.text(), /unauthorized-phone/);
    h.key('9');
    h.key('', { name: 'return' });
    assert.equal(h.launched.length, 0);
    h.key('2');
    assert.equal(h.launched.length, 0);
    h.key('', { name: 'return' });
    assert.deepEqual(h.launched, [['android', 'phone-123']]);
    assert.deepEqual(h.selected, ['phone-123']);
    h.key('i');
    assert.equal(h.launched.length, 1);
    h.child.emit('exit', 1, null);
    assert.match(h.text(), /failed \(1\)/);
    h.key('i');
    h.key('1');
    h.key('', { name: 'return' });
    assert.deepEqual(h.launched[1], ['ios', 'sim-1']);
  } finally { h.stop(); }
});

test('Escape cancels; Ctrl+C works during builds; disposal restores terminal', () => {
  const h = harness();
  assert.equal(h.input.isRaw, true);
  h.key('i');
  h.key('', { name: 'escape' });
  h.key('', { name: 'return' });
  assert.equal(h.launched.length, 0);
  h.key('i');
  h.key('1');
  h.key('', { name: 'return' });
  h.key('\u0003', { ctrl: true, name: 'c' });
  assert.equal(h.quit(), true);
  h.stop();
  assert.equal(h.killed(), true);
  assert.equal(h.input.isRaw, false);
  assert.equal(h.input.listenerCount('keypress'), 0);
});

test('Linux rejects iOS without probing devices and reports missing Android tooling', () => {
  const h = harness({
    host: 'linux',
    iosDevices: () => { throw new Error('must not probe Xcode'); },
    androidDevices: () => { throw new Error('adb unavailable'); },
  });
  try {
    h.key('i');
    assert.match(h.text(), /require macOS/);
    h.key('a');
    assert.match(h.text(), /adb unavailable/);
    assert.equal(h.launched.length, 0);
  } finally { h.stop(); }
});

test('non-interactive dev leaves terminal input alone', () => {
  const input = new PassThrough();
  input.isTTY = false;
  input.setRawMode = () => { throw new Error('must not change terminal'); };
  const stop = startDevControls({ input });
  assert.equal(input.listenerCount('keypress'), 0);
  stop();
});
