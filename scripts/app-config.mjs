import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(import.meta.dirname, '..');
const reserved = new Set('abstract as assert boolean break byte case catch char class const continue default do double else enum extends false final finally float for fun goto if implements import in instanceof int interface is long native new null object package private protected public return short static strictfp super switch synchronized this throw throws transient true try typealias typeof val var void volatile when while'.split(' '));
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

function object(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key))) {
    throw new Error(`package.json valdi.app: invalid ${label} (expected ${fields.join(', ')})`);
  }
}

function identifier(value, label, pattern) {
  if (typeof value !== 'string' || value.trim() !== value || !pattern.test(value) ||
      value.split('.').some(part => reserved.has(part))) {
    throw new Error(`package.json valdi.app: invalid ${label}`);
  }
  return value;
}

/** Installation identity can change without renaming native classes or existing module contracts. */
export function readAppConfig(root = repository) {
  const app = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).valdi?.app;
  object(app, ['name', 'displayName', 'android', 'ios', 'native'], 'configuration');
  object(app.android, ['applicationId'], 'android');
  object(app.ios, ['bundleIdentifier'], 'ios');
  object(app.native, ['androidNamespace', 'iosPrefix'], 'native');
  const name = identifier(app.name, 'name', /^[A-Za-z][A-Za-z0-9_]*$/);
  if (typeof app.displayName !== 'string' || !app.displayName.trim() ||
      app.displayName.length > 100 || /[\u0000-\u001f\u007f]/.test(app.displayName) || /\$[({]/.test(app.displayName)) {
    throw new Error('package.json valdi.app: displayName must be nonempty text without control characters or build-setting substitutions (max 100 characters)');
  }
  const androidId = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
  const applicationId = identifier(app.android.applicationId, 'android.applicationId', androidId);
  const androidNamespace = identifier(app.native.androidNamespace, 'native.androidNamespace', androidId);
  const bundleIdentifier = identifier(app.ios.bundleIdentifier, 'ios.bundleIdentifier', /^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/);
  const iosPrefix = identifier(app.native.iosPrefix, 'native.iosPrefix', /^[A-Z][A-Z0-9]{1,9}$/);
  if (['NS', 'UI', 'AV', 'CA', 'CF', 'SC'].includes(iosPrefix)) {
    throw new Error('package.json valdi.app: native.iosPrefix must not use an Apple/framework prefix');
  }
  return {
    name, displayName: app.displayName,
    android: { applicationId },
    ios: { bundleIdentifier },
    native: { androidNamespace, iosPrefix },
  };
}

export function appBuildPaths(root = repository) {
  const app = readAppConfig(root);
  return {
    androidApk: path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    iosProject: `${app.name}.xcodeproj`,
    iosScheme: app.name,
    iosApp: path.join(root, `ios/build/Build/Products/Debug-iphonesimulator/${app.name}.app`),
  };
}

export function iosProjectEnvironment(root = repository, env = process.env) {
  return { ...env, VALDI_APP_NAME: readAppConfig(root).name };
}

export function syncAppConfig(root = repository) {
  const app = readAppConfig(root);
  const write = (relative, content) => {
    const target = path.join(root, relative);
    if (existsSync(target) && readFileSync(target, 'utf8') === content) return;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  // AAPT's quoted string form preserves whitespace, apostrophes and literal @/? prefixes.
  const androidName = xml(`"${app.displayName.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`);
  write('android/app/build/generated/valdi-app/res/values/valdi_app.xml',
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="valdi_app_name">${androidName}</string>\n</resources>\n`);
  write('ios/Generated/App.yml', JSON.stringify({
    targets: { [app.name]: { settings: { base: {
      PRODUCT_BUNDLE_IDENTIFIER: app.ios.bundleIdentifier,
      PRODUCT_NAME: app.name,
      PRODUCT_MODULE_NAME: app.name,
    } } } },
  }, null, 2) + '\n');
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command = 'read', field] = process.argv.slice(2);
    if (!['read', 'sync'].includes(command) || (field && field !== '--json' && !['androidId', 'iosId'].includes(field))) {
      throw new Error('Usage: node scripts/app-config.mjs [read|sync] [--json|androidId|iosId]');
    }
    const app = command === 'sync' ? syncAppConfig() : readAppConfig();
    console.log(field === 'androidId' ? app.android.applicationId : field === 'iosId' ? app.ios.bundleIdentifier : JSON.stringify(app));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
