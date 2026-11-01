import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function validatePlatformConfig(config, file) {
  for (const [field, kind] of [['androidPermissions', 'permission'], ['androidFeatures', 'feature']]) {
    if (config[field] === undefined) continue;
    if (!Array.isArray(config[field])) throw new Error(`${file}: invalid ${field}`);
    for (const item of config[field]) {
      if (!item || typeof item !== 'object' || typeof item.name !== 'string' ||
          !new RegExp(`^android\\.${kind === 'permission' ? 'permission' : 'hardware'}\\.[A-Za-z0-9_.]+$`).test(item.name) ||
          Object.keys(item).some(key => !['name', ...(kind === 'permission' ? ['maxSdkVersion', 'usesPermissionFlags'] : ['required'])].includes(key)) ||
          (item.maxSdkVersion !== undefined && (!Number.isInteger(item.maxSdkVersion) || item.maxSdkVersion < 1)) ||
          (item.usesPermissionFlags !== undefined && item.usesPermissionFlags !== 'neverForLocation') ||
          (item.required !== undefined && typeof item.required !== 'boolean')) {
        throw new Error(`${file}: invalid ${field} entry`);
      }
    }
  }
  if (config.iosInfoPlist !== undefined &&
      (!config.iosInfoPlist || typeof config.iosInfoPlist !== 'object' || Array.isArray(config.iosInfoPlist) ||
       Object.entries(config.iosInfoPlist).some(([key, value]) => !/^NS[A-Za-z0-9]+UsageDescription$/.test(key) || typeof value !== 'string'))) {
    throw new Error(`${file}: iosInfoPlist supports string privacy usage descriptions only`);
  }
}

export function syncModulePlatformConfig(root, modules) {
  const write = (file, content) => {
    if (existsSync(file) && readFileSync(file, 'utf8') === content) return;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const collect = field => {
    const values = new Map();
    for (const module of modules) {
      for (const item of module[field] ?? []) {
        if (values.has(item.name) && JSON.stringify(values.get(item.name)) !== JSON.stringify(item))
          throw new Error(`Conflicting ${field} contribution: ${item.name}`);
        values.set(item.name, item);
      }
    }
    return [...values.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const manifest = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  if (existsSync(manifest)) {
    const tags = [['androidFeatures', 'uses-feature'], ['androidPermissions', 'uses-permission']]
      .flatMap(([field, tag]) => collect(field).map(item =>
        `    <${tag} ${Object.entries(item).map(([key, value]) => `android:${key}="${xml(value)}"`).join(' ')} />`));
    const source = readFileSync(manifest, 'utf8');
    if (!source.includes('<application')) throw new Error('App AndroidManifest.xml has no application element.');
    write(path.join(root, 'android/app/build/generated/valdi-module-manifest/AndroidManifest.xml'),
      source.replace('<application', `${tags.join('\n')}\n    <application`));
  }
  const baseInfo = path.join(root, 'ios/ValdiRoutes/Info.plist');
  if (existsSync(baseInfo)) {
    const entries = new Map();
    for (const module of modules) {
      for (const [key, value] of Object.entries(module.iosInfoPlist ?? {})) {
        if (entries.has(key) && entries.get(key) !== value) throw new Error(`Conflicting iosInfoPlist contribution: ${key}`);
        entries.set(key, value);
      }
    }
    const source = readFileSync(baseInfo, 'utf8');
    for (const key of entries.keys()) {
      if (source.includes(`<key>${key}</key>`)) throw new Error(`Module privacy key ${key} must not also be declared in the App base Info.plist.`);
    }
    const closing = /<\/dict>\s*<\/plist>\s*$/;
    if (!closing.test(source)) throw new Error('App base Info.plist has no root dictionary.');
    const tags = [...entries].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `\t<key>${key}</key>\n\t<string>${xml(value)}</string>\n`).join('');
    write(path.join(root, 'ios/Generated/AppInfo.plist'), source.replace(closing, `${tags}</dict>\n</plist>\n`));
  }
}
