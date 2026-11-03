import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../tools/valdi-rolldown/package.json', import.meta.url));
const ts = require('typescript');
const source = new URL('../../../harmony/entry/src/main/ets/platform/HarmonyAppUIMediaService.ets', import.meta.url);
const turn = async () => { for (let i = 0; i < 30; ++i) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function environment() {
  const calls = [], files = new Map(), descriptors = new Map(), mimeQueries = [];
  let next = 1, copies = 0, closes = 0;
  const hooks = {
    scan: async () => ({ scanType: 1, originalValue: 'payload' }),
    photos: async () => ({ photoUris: ['file://picked/a.png'] }),
    documents: async () => ['file://picked/a.txt'],
    camera: async () => ({ resultCode: 0, resultUri: 'file://picked/a.jpg', mediaType: 'photo' }),
    copy: async () => {},
    stat: async () => 123,
    close: async () => {},
    remove: async () => {},
    mime: value => value
  };
  const sdk = {
    '@kit.AbilityKit': {},
    '@kit.BasicServicesKit': {},
    '@kit.ScanKit': {
      scanCore: { ScanType: { QR_CODE: 1, EAN13_CODE: 2, EAN8_CODE: 3, CODE128_CODE: 4, CODE39_CODE: 5, UPC_A_CODE: 6 } },
      scanBarcode: { startScanForResult(context, options) { calls.push(['scan', context, options]); return hooks.scan(); } }
    },
    '@kit.CameraKit': {
      camera: { CameraPosition: { CAMERA_POSITION_BACK: 1 } },
      cameraPicker: { PickerMediaType: { PHOTO: 'photo' }, pick(context, types, options) {
        calls.push(['camera', context, types, options]); return hooks.camera();
      } }
    },
    '@kit.MediaLibraryKit': { photoAccessHelper: {
      PhotoViewMIMETypes: { IMAGE_TYPE: 'image/*' },
      PhotoViewPicker: class { constructor(context) { this.context = context; }
        select(options) { calls.push(['photos', this.context, options]); return hooks.photos(); } }
    } },
    '@kit.CoreFileKit': {
      picker: { DocumentViewPicker: class { constructor(context) { this.context = context; }
        select(options) { calls.push(['files', this.context, options]); return hooks.documents(); } } },
      fileUri: {
        FileUri: class { constructor(uri) { this.path = uri.replace('file://', ''); this.name = decodeURIComponent(uri.split('/').pop()); } },
        getUriFromPath: path => `file://${path}`
      },
      fileIo: {
        OpenMode: { READ_ONLY: 0 },
        accessSync: path => files.has(path),
        async mkdir(path) { files.set(path, 'directory'); },
        async open(uri) { const fd = next++; descriptors.set(fd, uri); return { fd }; },
        async copyFile(fd, path) { ++copies; files.set(path, 'partial'); await hooks.copy(fd, path); files.set(path, 'data'); },
        async stat(path) { assert(files.has(path)); return { size: await hooks.stat(path) }; },
        async close(file) { ++closes; descriptors.delete(file.fd); await hooks.close(); },
        async unlink(path) { await hooks.remove(path); files.delete(path); },
        async rmdir(path) { await hooks.remove(path); for (const key of files.keys()) if (key === path || key.startsWith(path + '/')) files.delete(key); }
      }
    },
    '@ohos.util': { default: { generateRandomUUID: () => `uuid-${next++}` } },
    '@kit.ArkData': { uniformTypeDescriptor: {
      getUniformDataTypeByFilenameExtension(suffix) { return suffix; },
      getUniformDataTypeByMIMEType(mime) { mimeQueries.push(mime); return mime; },
      getTypeDescriptor(type) {
        const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.pdf': 'application/pdf' };
        return { mimeTypes: [hooks.mime(types[type] ?? 'application/octet-stream')], filenameExtensions: type === 'text/plain' ? ['.txt'] : [] };
      }
    } }
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
    assert(name in sdk, name); return sdk[name];
  }, Error, Promise, console });
  const context = { cacheDir: '/cache', applicationInfo: { uid: 123, name: 'bundle' } };
  const create = () => {
    const service = new module.exports.HarmonyAppUIMediaService(context);
    service.setOwner('A', true);
    return service;
  };
  return { create, context, hooks, calls, files, descriptors, mimeQueries, get copies() { return copies; }, get closes() { return closes; } };
}
test('all six scanner formats, exact SDK options, cancel code and failure stay distinct', async () => {
  const e = environment(), s = e.create();
  for (const [index, type] of ['QR_CODE', 'EAN_13', 'EAN_8', 'CODE_128', 'CODE_39', 'UPC_A'].entries()) {
    e.hooks.scan = async () => ({ scanType: index + 1, originalValue: '中文' });
    assert.equal((await s.scanCode()).scanType, type);
  }
  assert.equal(e.calls[0][1], e.context);
  assert.equal(e.calls[0][2].enableAlbum, false);
  e.hooks.scan = async () => { throw { code: 1000500002, message: 'SDK cancel description' }; };
  await assert.rejects(s.scanCode(), { message: 'cancel' });
  for (const value of [{ code: 1000500001, message: 'cancel' }, { code: 401 }, Error('cancel'), null, undefined]) {
    e.hooks.scan = async () => { throw value; };
    await assert.rejects(s.scanCode(), /E_SCAN_CODE/);
  }
  e.hooks.scan = async () => ({ scanType: 100, originalValue: '' });
  await assert.rejects(s.scanCode(), /E_SCAN_CODE/);
});
test('photos/files/camera preserve counts, selection order, typed cache metadata and original names', async () => {
  const e = environment(), s = e.create();
  e.hooks.documents = async () => ['file://picked/a.txt', 'file://picked/b.txt'];
  const result = await s.pickAttachments('files', 2, ['text/plain']);
  assert.equal(result.canceled, false);
  assert.deepEqual(Array.from(result.assets, a => a.name), ['a.txt', 'b.txt']);
  assert(result.assets.every(a => a.uri.startsWith('file:///cache/valdi-appui-attachments/') && a.size === 123 && a.mimeType === 'text/plain'));
  assert.equal(e.calls[0][2].maxSelectNumber, 2);
  assert.equal(e.calls[0][2].fileSuffixFilters[0], '.txt');
  assert.equal(e.descriptors.size, 0);
  assert.equal((await s.pickAttachments('photos', 3, ['image/*'])).assets[0].mimeType, 'image/png');
  assert.equal(e.calls[1][2].maxSelectNumber, 3);
  assert.equal((await s.pickAttachments('camera', 20, ['image/*'])).assets.length, 1);
  assert.equal(e.calls[2][2][0], 'photo');
});
test('only documented empty picker returns cancel; SDK and camera failure never fabricate cancel', async () => {
  const e = environment(), s = e.create();
  e.hooks.photos = async () => ({ photoUris: [] });
  e.hooks.documents = async () => [];
  e.hooks.camera = async () => ({ resultCode: 0, resultUri: '', mediaType: '' });
  for (const source of ['photos', 'files', 'camera']) {
    const result = await s.pickAttachments(source, 1, ['*/*']);
    assert.equal(result.canceled, true); assert.equal(result.assets.length, 0);
  }
  e.hooks.camera = async () => ({ resultCode: -1, resultUri: '', mediaType: '' });
  await assert.rejects(s.pickAttachments('camera', 1, ['*/*']), /E_ATTACHMENT_LOAD/);
  e.hooks.camera = async () => ({ resultCode: 0, resultUri: '', mediaType: 'photo' });
  await assert.rejects(s.pickAttachments('camera', 1, ['*/*']), /E_ATTACHMENT_LOAD/);
  e.hooks.camera = async () => ({ resultCode: 0 });
  await assert.rejects(s.pickAttachments('camera', 1, ['*/*']), /E_ATTACHMENT_LOAD/);
  e.hooks.photos = async () => { throw { code: 13900042, message: 'failure' }; };
  await assert.rejects(s.pickAttachments('photos', 1, ['*/*']), /E_ATTACHMENT_LOAD/);
});
test('invalid source/count, MIME mismatch and excessive SDK selection are failures before any publication', async () => {
  const e = environment(), s = e.create();
  await assert.rejects(s.pickAttachments('unknown', 1, []), /E_INVALID_SOURCE/);
  await assert.rejects(s.pickAttachments('files', NaN, []), /E_INVALID/);
  await assert.rejects(s.pickAttachments('photos', 1, ['text/plain']), /E_UNSUPPORTED_MIME_TYPES/);
  await assert.rejects(s.pickAttachments('files', 1, ['image/*']), /E_UNSUPPORTED_MIME_TYPES/);
  e.hooks.photos = async () => ({ photoUris: ['file://picked/a.png', 'file://picked/b.png'] });
  await assert.rejects(s.pickAttachments('photos', 1, ['image/*']), /E_ATTACHMENT_LOAD/);
  assert.equal(e.copies, 0);
});
test('partial copy, stat/close failure and later MIME failure roll back every owned file', async () => {
  for (const mode of ['copy', 'stat', 'close', 'mime']) {
    const e = environment(), s = e.create();
    e.hooks.documents = async () => ['file://picked/a.txt', mode === 'mime' ? 'file://picked/b.jpg' : 'file://picked/b.txt'];
    let count = 0;
    if (mode === 'copy') e.hooks.copy = async () => { if (++count === 2) throw Error('copy'); };
    if (mode === 'stat') e.hooks.stat = async () => { if (++count === 2) throw Error('stat'); return 123; };
    if (mode === 'close') e.hooks.close = async () => { if (++count === 2) throw Error('close'); };
    await assert.rejects(s.pickAttachments('files', 2, ['text/plain']));
    assert.equal([...e.files.values()].filter(value => value !== 'directory').length, 0, mode);
    assert.equal(e.descriptors.size, 0, mode);
  }
});
test('system SDK hide/result waits for same owner foreground, without canceling physical UI', async () => {
  for (const kind of ['scan', 'photos', 'documents', 'camera']) {
    const e = environment(), s = e.create(), sdk = deferred();
    e.hooks[kind] = () => sdk.promise;
    const pending = kind === 'scan' ? s.scanCode() : s.pickAttachments(
      kind === 'documents' ? 'files' : kind === 'camera' ? 'camera' : 'photos', 1, ['*/*']);
    let settled = false; pending.finally(() => { settled = true; });
    s.setOwner('A', false);
    sdk.resolve(kind === 'scan' ? { scanType: 1, originalValue: 'ok' } :
      kind === 'photos' ? { photoUris: ['file://picked/a.png'] } :
      kind === 'documents' ? ['file://picked/a.txt'] : { resultCode: 0, resultUri: 'file://picked/a.jpg', mediaType: 'photo' });
    await turn(); assert.equal(settled, false, kind);
    await assert.rejects(s.scanCode(), /BACKGROUND/);
    s.setOwner('A', true);
    await pending; assert.equal(settled, true);
  }
});
test('route changes preserve activity/window-owned media result and calling-page completion', async () => {
  const e = environment(), s = e.create(), sdk = deferred();
  e.hooks.photos = () => sdk.promise;
  const pending = s.pickAttachments('photos', 1, ['image/*']);
  s.setOwner('B', true);
  sdk.resolve({ photoUris: ['file://picked/a.png'] });
  assert.equal((await pending).assets.length, 1);
});
test('runtime close settles once, late SDK cannot reach replacement, fence survives reopen', async () => {
  for (const action of ['close', 'hide-close']) {
    const e = environment(), s = e.create(), sdk = deferred();
    e.hooks.photos = () => sdk.promise;
    const pending = s.pickAttachments('photos', 1, ['image/*']);
    let terminals = 0; pending.then(() => ++terminals, () => ++terminals);
    if (action === 'hide-close') s.setOwner('A', false);
    s.close();
    await assert.rejects(pending, /E_APP_UI_(OWNER|CLOSED)/);
    const replacement = e.create();
    await assert.rejects(replacement.scanCode(), /E_APP_UI_MEDIA_BUSY/);
    await assert.rejects(replacement.clearAttachmentCache(), /E_APP_UI_MEDIA_BUSY/);
    sdk.resolve({ photoUris: ['file://picked/a.png'] }); await turn();
    assert.equal(terminals, 1); assert.equal(e.copies, 0);
    assert.equal((await replacement.scanCode()).result, 'payload');
  }
});
test('close during copy cleans late partial files and does not release cache fence early', async () => {
  const e = environment(), s = e.create(), copy = deferred();
  e.hooks.copy = () => copy.promise;
  const pending = s.pickAttachments('photos', 1, ['image/*']);
  await turn(); assert.equal(e.copies, 1);
  s.close(); await assert.rejects(pending, /CLOSED/);
  const next = e.create();
  await assert.rejects(next.clearAttachmentCache(), /BUSY/);
  copy.resolve(); await turn();
  assert.equal([...e.files.values()].filter(value => value !== 'directory').length, 0);
  await next.clearAttachmentCache();
});
test('cache clear deletes only owned directory, propagates failures, permits immediate reentry after success', async () => {
  const e = environment(), s = e.create();
  e.files.set('/cache/unrelated', 'preserve');
  await s.pickAttachments('photos', 1, ['image/*']);
  assert.equal(await s.clearAttachmentCache(), undefined);
  assert.equal(e.files.get('/cache/unrelated'), 'preserve');
  await s.clearAttachmentCache();
  await s.pickAttachments('photos', 1, ['image/*']);
  e.hooks.remove = async () => { throw Error('disk'); };
  await assert.rejects(s.clearAttachmentCache(), /E_ATTACHMENT_CACHE/);
  e.hooks.remove = async () => {};
  await s.clearAttachmentCache();
  assert.equal((await s.scanCode()).result, 'payload');
});
test('cleanup attempts every partial file even after unlink failure, reports cache failure', async () => {
  const e = environment(), s = e.create();
  e.hooks.documents = async () => ['file://picked/a.txt', 'file://picked/b.txt'];
  let copies = 0, removals = 0;
  e.hooks.copy = async () => { if (++copies === 2) throw Error('copy'); };
  e.hooks.remove = async () => { if (++removals === 1) throw Error('unlink'); };
  await assert.rejects(s.pickAttachments('files', 2, ['text/plain']), /E_ATTACHMENT_CACHE/);
  assert.equal(removals, 2);
  assert.equal(e.descriptors.size, 0);
  e.hooks.remove = async () => {};
  await s.clearAttachmentCache();
  assert.equal(e.files.size, 0);
});
test('user background blocks launches and delivery until return; runtime close retires parked result', async () => {
  const e = environment(), s = e.create(), sdk = deferred();
  e.hooks.scan = () => sdk.promise;
  const pending = s.scanCode();
  s.setOwner('A', false);
  await assert.rejects(s.pickAttachments('files', 1, []), /BACKGROUND/);
  sdk.resolve({ scanType: 1, originalValue: 'parked' });
  await turn();
  s.close();
  await assert.rejects(pending, /CLOSED/);
  await turn();
  e.hooks.scan = async () => ({ scanType: 1, originalValue: 'replacement' });
  assert.equal((await e.create().scanCode()).result, 'replacement');
});
test('cache clear physical work remains fenced after runtime close until actual fs terminal', async () => {
  const e = environment(), s = e.create(), removal = deferred();
  await s.pickAttachments('photos', 1, ['image/*']);
  e.hooks.remove = () => removal.promise;
  const clear = s.clearAttachmentCache();
  s.close(); await assert.rejects(clear, /CLOSED/);
  const next = e.create();
  await assert.rejects(next.pickAttachments('files', 1, []), /BUSY/);
  removal.resolve(); await turn();
  e.hooks.remove = async () => {};
  await next.clearAttachmentCache();
});
test('cache clear is runtime-owned filesystem work and does not require a foreground presenter', async () => {
  const e = environment(), s = e.create();
  await s.pickAttachments('photos', 1, ['image/*']);
  s.setOwner('', false);
  assert.equal(await s.clearAttachmentCache(), undefined);
  assert.equal(e.files.size, 0);
  await assert.rejects(s.scanCode(), /BACKGROUND/);
});
for (const failure of ['sdk', 'camera', 'copy', 'stat', 'close', 'cleanup']) {
  for (const terminal of ['foreground', 'close']) {
    test(`picker ${failure} failure rolls back before waiting for ${terminal} and settles once`, async () => {
      const e = environment(), s = e.create(), blocked = deferred();
      const isSDK = failure === 'sdk' || failure === 'camera';
      if (failure === 'sdk') e.hooks.documents = () => blocked.promise;
      if (failure === 'camera') e.hooks.camera = () => blocked.promise;
      if (failure === 'copy' || failure === 'cleanup') e.hooks.copy = () => blocked.promise;
      if (failure === 'stat') e.hooks.stat = () => blocked.promise;
      if (failure === 'close') e.hooks.close = () => blocked.promise;
      const removals = [];
      e.hooks.remove = async path => {
        removals.push(path);
        if (failure === 'cleanup') throw Error('unlink refused');
      };
      const result = s.pickAttachments(failure === 'camera' ? 'camera' : 'files', 1, ['*/*']);
      let state = 'pending', terminals = 0, rejection;
      result.then(() => { state = 'ok'; ++terminals; }, error => { state = 'error'; rejection = error; ++terminals; });
      await turn();
      assert.equal(state, 'pending');
      if (!isSDK) assert.equal(e.copies, 1);
      s.setOwner('A', false);
      if (failure === 'camera') blocked.resolve({ resultCode: -1, resultUri: '', mediaType: '' });
      else blocked.reject(Error(`${failure} failure`));
      await turn();
      try {
        assert.equal(e.descriptors.size, 0, 'descriptor close must not wait for foreground');
        assert.equal(removals.length, isSDK ? 0 : 1, 'rollback must run while backgrounded');
        assert.equal([...e.files.values()].filter(value => value !== 'directory').length,
          failure === 'cleanup' ? 1 : 0, 'rollback must remove partial files immediately where filesystem permits');
        assert.equal(state, 'pending', 'live UI selection errors must await foreground');
        if (terminal === 'foreground') s.setOwner('B', true);
        else s.close();
        await assert.rejects(result, terminal === 'close' ? /E_APP_UI_CLOSED/ :
          failure === 'cleanup' ? /E_ATTACHMENT_CACHE/ : /E_ATTACHMENT_LOAD/);
        await turn();
        assert.equal(terminals, 1);
        if (terminal === 'foreground') {
          e.hooks.remove = async () => {};
          s.setOwner('', false);
          await s.clearAttachmentCache();
        }
      } finally { s.close(); await turn(); }
    });
  }
}
test('requested exact and wildcard MIME values normalize across document/photo/camera selection and filters', async () => {
  const e = environment(), s = e.create();
  for (const [source, allowed, expected] of [
    ['files', ['TEXT/PLAIN'], 'text/plain'],
    ['files', ['TeXt/*'], 'text/plain'],
    ['files', ['APPLICATION/PDF', 'TeXt/PlAiN'], 'text/plain'],
    ['photos', ['IMAGE/*'], 'image/png'],
    ['photos', ['ImAgE/PnG'], 'image/png'],
    ['camera', ['IMAGE/*'], 'image/jpeg'],
    ['camera', ['ImAgE/JpEg'], 'image/jpeg']
  ]) {
    const selected = await s.pickAttachments(source, 1, allowed);
    assert.equal(selected.assets[0].mimeType, expected);
  }
  assert(e.mimeQueries.includes('text/plain'));
  assert(e.mimeQueries.every(value => value === value.toLowerCase()), 'SDK MIME filters must receive canonical types');
  assert.equal(e.calls[0][2].fileSuffixFilters[0], '.txt');
  await assert.rejects(s.pickAttachments('files', 1, ['IMAGE/*']), /E_UNSUPPORTED_MIME_TYPES/);
});
test('SDK descriptor MIME casing is canonical in returned metadata and allowlist comparisons', async () => {
  const e = environment(), s = e.create();
  e.hooks.mime = value => value.toUpperCase();
  for (const [source, allowed, expected] of [
    ['files', ['text/plain'], 'text/plain'],
    ['photos', ['image/*'], 'image/png'],
    ['camera', ['IMAGE/JPEG'], 'image/jpeg']
  ]) {
    assert.equal((await s.pickAttachments(source, 1, allowed)).assets[0].mimeType, expected);
  }
});
