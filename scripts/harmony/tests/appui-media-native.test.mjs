import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { environment } from './appui-media.test.mjs';

const { create, activity } = createRequire(import.meta.url)(process.env.APPUI_MEDIA_ADDON);
const turn = () => new Promise(resolve => setImmediate(resolve));
function feedback(media) {
  return { media, async showLoading() {}, async hideLoading() {}, async showToast() {}, async hideToast() {} };
}
function invoke(session, method, args = []) {
  assert.equal(session.eval(`globalThis.terminals=0;globalThis.terminal='pending';globalThis.result=undefined;
    globalThis.promise=__harmonyBusinessBootstrap.appUI.${method}(...${JSON.stringify(args)});
    promise.then(v=>{++globalThis.terminals;globalThis.result=v;globalThis.terminal='ok';},
      e=>{++globalThis.terminals;globalThis.result=String(e);globalThis.terminal='error';});
    promise instanceof Promise`), 'true');
  session.flush();
}
async function finish(session, terminal = 'ok') {
  for (let n = 0; n < 60 && session.eval('terminal') === 'pending'; ++n) { await turn(); session.flush(); }
  assert.equal(session.eval('terminal'), terminal, session.eval('result'));
  assert.equal(session.eval('terminals'), '1');
  return session.eval('JSON.stringify(result)');
}
function pending() {
  let resolve, reject;
  return { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), get resolve() { return resolve; }, get reject() { return reject; } };
}
test('concrete feedback/media operations preserve receivers, argument shapes and Promise transport', async () => {
  const calls = [];
  let observedPromises = 0;
  const media = { setOwner() {}, close() {} };
  const owner = feedback(media);
  const loading = { title: 'Loading 中文\0end', mask: true };
  const toast = { title: 'Saved', icon: 'success', duration: 17, mask: false };
  const operations = [
    ['showLoading', [loading], owner, undefined],
    ['scanCode', [], media, { result: 'typed scan', scanType: 'QR_CODE' }],
    ['showToast', [toast], owner, undefined],
    ['pickAttachments', ['files', 3, ['text/plain', 'image/*']], media, { canceled: true, assets: [] }],
    ['hideLoading', [], owner, undefined],
    ['clearAttachmentCache', [], media, undefined],
    ['hideToast', [], owner, undefined]
  ];
  for (const [method, , receiver, reply] of operations) {
    receiver[method] = function (...args) {
      assert.equal(this, receiver);
      calls.push([method, args]);
      const promise = Promise.resolve(reply);
      promise.then = function (...handlers) {
        assert.equal(this, promise);
        ++observedPromises;
        return Promise.prototype.then.apply(this, handlers);
      };
      return promise;
    };
  }
  const s = create(owner);
  try {
    for (const [method, args, , reply] of operations) {
      invoke(s, method, args);
      assert.equal(await finish(s), reply === undefined ? 'undefined' : JSON.stringify(reply));
    }
    assert.deepEqual(calls, operations.map(([method, args]) => [method, args]));
    assert.equal(observedPromises, 7);
    activity(s, false);
    for (const [method, args] of [['showLoading', [loading]], ['showToast', [toast]]]) {
      invoke(s, method, args);
      await finish(s, 'error');
      assert.match(s.eval('result'), /E_APP_UI_FEEDBACK:typed feedback invocation failed/);
    }
    assert.equal(calls.length, 7, 'background show operations must not invoke feedback');
    for (const method of ['hideLoading', 'hideToast', 'clearAttachmentCache']) {
      invoke(s, method);
      assert.equal(await finish(s), 'undefined');
    }
    assert.deepEqual(calls.slice(7), [['hideLoading', []], ['hideToast', []], ['clearAttachmentCache', []]]);
  } finally { s.control('close'); }
});
test('production SDK adapter -> actual Node-API -> generated c+ proxy -> engine Promise: scan/selection/cache', async () => {
  const e = environment(), service = e.create(), s = create(feedback(service));
  try {
    invoke(s, 'scanCode');
    assert.deepEqual(JSON.parse(await finish(s)), { result: 'payload', scanType: 'QR_CODE' });
    invoke(s, 'pickAttachments', ['files', 1, ['text/plain']]);
    const selection = JSON.parse(await finish(s));
    assert.equal(selection.canceled, false);
    assert.equal(selection.assets[0].name, 'a.txt');
    assert.equal(selection.assets[0].size, 123);
    assert.equal(selection.assets[0].mimeType, 'text/plain');
    assert.equal(e.calls[1][2].maxSelectNumber, 1);
    invoke(s, 'clearAttachmentCache');
    assert.equal(await finish(s), 'undefined');
    activity(s, false);
    invoke(s, 'clearAttachmentCache');
    assert.equal(await finish(s), 'undefined', 'cache work has no foreground presenter dependency');
    activity(s, true);
    invoke(s, 'scanCode');
    await finish(s);
  } finally { s.control('close'); }
});
test('scanner SDK cancel is exactly cancel through real native Error/Promise, attachment cancellation stays typed', async () => {
  const e = environment(), s = create(feedback(e.create()));
  try {
    e.hooks.scan = async () => { throw { code: 1000500002, message: 'SDK canceled' }; };
    invoke(s, 'scanCode');
    await finish(s, 'error'); assert.match(s.eval('result'), /(?:^|: )cancel$/);
    e.hooks.photos = async () => ({ photoUris: [] });
    invoke(s, 'pickAttachments', ['photos', 1, ['image/*']]);
    assert.deepEqual(JSON.parse(await finish(s)), { canceled: true, assets: [] });
    e.hooks.documents = async () => { throw Error('disk failure'); };
    invoke(s, 'pickAttachments', ['files', 1, ['*/*']]);
    await finish(s, 'error'); assert.match(s.eval('result'), /E_ATTACHMENT_LOAD:disk failure/);
  } finally { s.control('close'); }
});
test('pending media Context pin survives route change and Context removal through typed engine completion', async () => {
  const e = environment(), sdk = pending(), s = create(feedback(e.create()));
  try {
    e.hooks.scan = () => sdk.promise;
    invoke(s, 'scanCode');
    s.control('foreground', 'NextRoute');
    assert.equal(s.control('detach'), false, 'pending native request retains Context');
    sdk.resolve({ scanType: 1, originalValue: 'after route removal' });
    assert.equal(JSON.parse(await finish(s)).result, 'after route removal');
  } finally { s.control('close'); }
});
test('native activity hide caused by SDK launch defers success; same runtime foreground delivers', async () => {
  const e = environment(), sdk = pending(), s = create(feedback(e.create()));
  try {
    e.hooks.photos = () => sdk.promise;
    invoke(s, 'pickAttachments', ['photos', 1, ['image/*']]);
    activity(s, false);
    sdk.resolve({ photoUris: ['file://picked/a.png'] });
    for (let n = 0; n < 3; ++n) { await turn(); s.flush(); }
    assert.equal(s.eval('terminal'), 'pending');
    activity(s, true);
    assert.equal(JSON.parse(await finish(s)).assets.length, 1);
  } finally { s.control('close'); }
});
test('native close rejects exactly once and clears service callbacks; replacement fenced until late SDK return', async () => {
  const e = environment(), sdk = pending(), service = e.create(), s = create(feedback(service));
  e.hooks.photos = () => sdk.promise;
  invoke(s, 'pickAttachments', ['photos', 1, ['image/*']]);
  // Node-side bridge is retained independently of the engine destroyed by close.
  const outstanding = s.call('scanCode'); s.flush(); // busy but still pending JS delivery
  const rejected = assert.rejects(outstanding, /E_APP_UI_(MEDIA_BUSY|CLOSED)/);
  s.control('close');
  await rejected;
  assert.equal(service.retire, undefined);
  assert.equal(service.wake, undefined);
  const next = create(feedback(e.create()));
  try {
    invoke(next, 'scanCode'); await finish(next, 'error'); assert.match(next.eval('result'), /MEDIA_BUSY/);
    sdk.resolve({ photoUris: ['file://picked/a.png'] });
    await turn(); next.flush();
    invoke(next, 'scanCode'); assert.equal(JSON.parse(await finish(next)).result, 'payload');
    assert.equal(e.copies, 0);
  } finally { next.control('close'); }
});
test('native pending scanner rejects on teardown and late SDK rejection cannot strand the replacement fence', async () => {
  const e = environment(), sdk = pending(), s = create(feedback(e.create()));
  e.hooks.scan = () => sdk.promise;
  const result = s.call('scanCode'); result.catch(() => {}); s.flush();
  try {
    assert.equal(s.control('detach'), false);
    s.control('close');
    await assert.rejects(result, /E_APP_UI_CLOSED/);
  } finally { s.control('close'); }
  const replacement = create(feedback(e.create()));
  try {
    invoke(replacement, 'scanCode'); await finish(replacement, 'error');
    assert.match(replacement.eval('result'), /MEDIA_BUSY/);
    sdk.reject({ code: 1000500002 });
    await turn(); replacement.flush();
    e.hooks.scan = async () => ({ scanType: 1, originalValue: 'new scanner' });
    invoke(replacement, 'scanCode');
    assert.equal(JSON.parse(await finish(replacement)).result, 'new scanner');
  } finally { replacement.control('close'); }
});
test('invalid typed reply, non-Promise and synchronous throw reject; duplicate then callbacks settle once', async () => {
  const media = {
    setOwner() {}, close() {},
    async scanCode() { return { result: 'text', scanType: 'QR_CODE' }; },
    async pickAttachments() { return { canceled: false, assets: [{ id: 'a', uri: 'file:///cache/a', name: 'a', mimeType: 'text/plain', size: -1 }] }; },
    async clearAttachmentCache() {}
  };
  const s = create(feedback(media));
  try {
    invoke(s, 'pickAttachments', ['files', 1, ['*/*']]);
    await finish(s, 'error'); assert.match(s.eval('result'), /invalid typed SDK result/);
    for (const implementation of [() => 42, () => { throw Error('sync'); }]) {
      media.scanCode = implementation;
      invoke(s, 'scanCode'); await finish(s, 'error'); assert.match(s.eval('result'), /typed SDK invocation failed/);
    }
    media.scanCode = () => {
      const promise = Promise.resolve();
      promise.then = (yes, no) => { yes({ result: 'first', scanType: 'QR_CODE' }); no(Error('late')); yes({ result: 'late' }); throw Error('after'); };
      return promise;
    };
    invoke(s, 'scanCode');
    assert.equal(JSON.parse(await finish(s)).result, 'first');
  } finally { s.control('close'); }
});
test('mixed MIME allowlists cross the real generated host into SDK admission/filtering and canonical metadata', async () => {
  const e = environment(), s = create(feedback(e.create()));
  try {
    for (const [source, allowed, expected] of [
      ['files', ['TEXT/PLAIN'], 'text/plain'],
      ['files', ['TeXt/*'], 'text/plain'],
      ['photos', ['IMAGE/*'], 'image/png'],
      ['photos', ['ImAgE/PnG'], 'image/png'],
      ['camera', ['IMAGE/*'], 'image/jpeg'],
      ['camera', ['ImAgE/JpEg'], 'image/jpeg']
    ]) {
      invoke(s, 'pickAttachments', [source, 1, allowed]);
      const selection = JSON.parse(await finish(s));
      assert.equal(selection.assets[0].mimeType, expected);
    }
    assert(e.mimeQueries.every(value => value === value.toLowerCase()));
  } finally { s.control('close'); }
});
test('native picker SDK/copy/cleanup failures remain parked after immediate rollback until foreground', async () => {
  for (const failure of ['sdk', 'camera', 'copy', 'cleanup']) {
    const e = environment(), blocked = pending(), s = create(feedback(e.create()));
    if (failure === 'sdk') e.hooks.documents = () => blocked.promise;
    else if (failure === 'camera') e.hooks.camera = () => blocked.promise;
    else e.hooks.copy = () => blocked.promise;
    const removals = [];
    e.hooks.remove = async path => { removals.push(path); if (failure === 'cleanup') throw Error('unlink refused'); };
    try {
      invoke(s, 'pickAttachments', [failure === 'camera' ? 'camera' : 'files', 1, ['*/*']]);
      for (let n = 0; n < 2; ++n) { await turn(); s.flush(); }
      activity(s, false);
      if (failure === 'camera') blocked.resolve({ resultCode: -1, resultUri: '', mediaType: '' });
      else blocked.reject(Error(`${failure} failure`));
      for (let n = 0; n < 3; ++n) { await turn(); s.flush(); }
      assert.equal(removals.length, failure === 'sdk' || failure === 'camera' ? 0 : 1);
      assert.equal(e.descriptors.size, 0);
      assert.equal(s.eval('terminal'), 'pending', failure);
      activity(s, true);
      await finish(s, 'error');
      assert.match(s.eval('result'), failure === 'cleanup' ? /E_ATTACHMENT_CACHE/ : /E_ATTACHMENT_LOAD/);
    } finally { s.control('close'); }
  }
});
