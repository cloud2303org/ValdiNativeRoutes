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
          Object.keys(item).some(key => !['name', ...(kind === 'permission' ? ['maxSdkVersion', 'usesPermissionFlags', 'removeMaxSdkVersion'] : ['required'])].includes(key)) ||
          (item.maxSdkVersion !== undefined && (!Number.isInteger(item.maxSdkVersion) || item.maxSdkVersion < 1)) ||
          (item.usesPermissionFlags !== undefined && item.usesPermissionFlags !== 'neverForLocation') ||
          (item.removeMaxSdkVersion !== undefined && (item.removeMaxSdkVersion !== true || item.maxSdkVersion !== undefined)) ||
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
  if (config.iosFrameworks !== undefined &&
      (!Array.isArray(config.iosFrameworks) || config.iosFrameworks.some(value =>
        typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(value)))) {
    throw new Error(`${file}: invalid iosFrameworks`);
  }
  if (config.iosBackgroundModes !== undefined &&
      (!Array.isArray(config.iosBackgroundModes) || config.iosBackgroundModes.some(value => value !== 'audio'))) {
    throw new Error(`${file}: invalid iosBackgroundModes (only audio is supported)`);
  }
  if (config.iosPackages !== undefined &&
      (!Array.isArray(config.iosPackages) || config.iosPackages.some(item => {
        if (!item || typeof item !== 'object' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(item.name ?? '') ||
            Object.keys(item).some(key => !['name', 'url', 'revision', 'from', 'product'].includes(key)) ||
            (item.product !== undefined && !/^[A-Za-z][A-Za-z0-9_]*$/.test(item.product))) return true;
        let url;
        try { url = new URL(item.url); } catch { return true; }
        return url.protocol !== 'https:' || !!url.username || !!url.password || !!url.search || !!url.hash ||
          (item.revision !== undefined ? !/^[a-f0-9]{40}$/.test(item.revision) || item.from !== undefined
            : typeof item.from !== 'string' || !/^\d+\.\d+\.\d+$/.test(item.from));
      }))) {
    throw new Error(`${file}: invalid iosPackages`);
  }
  if (config.iosEntitlements !== undefined &&
      (!config.iosEntitlements || typeof config.iosEntitlements !== 'object' || Array.isArray(config.iosEntitlements) ||
       Object.entries(config.iosEntitlements).some(([key, value]) =>
         !/^com\.apple\.[A-Za-z0-9_.-]+$/.test(key) || typeof value !== 'boolean'))) {
    throw new Error(`${file}: invalid iosEntitlements`);
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
  const entriesFor = field => {
    const entries = new Map();
    for (const module of modules) {
      for (const [key, value] of Object.entries(module[field] ?? {})) {
        if (entries.has(key) && entries.get(key) !== value) throw new Error(`Conflicting ${field} contribution: ${key}`);
        entries.set(key, value);
      }
    }
    return entries;
  };
  const manifest = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  if (existsSync(manifest)) {
    const tags = [['androidFeatures', 'uses-feature'], ['androidPermissions', 'uses-permission']]
      .flatMap(([field, tag]) => collect(field).map(item =>
        `    <${tag} ${Object.entries(item).map(([key, value]) => key === 'removeMaxSdkVersion'
          ? 'tools:remove="android:maxSdkVersion"' : `android:${key}="${xml(value)}"`).join(' ')} />`));
    const source = readFileSync(manifest, 'utf8');
    if (!source.includes('<application')) throw new Error('App AndroidManifest.xml has no application element.');
    const application = modules.flatMap(module => {
      const fragment = path.join(root, `valdi/modules/${module.name}/android/AndroidManifest.xml`);
      if (!existsSync(fragment)) return [];
      const content = readFileSync(fragment, 'utf8');
      const match = /^\s*(?:<\?xml[^>]*>\s*)?<manifest\b[^>]*>\s*<application\s*>([\s\S]*)<\/application>\s*<\/manifest>\s*$/.exec(content);
      if (!match) throw new Error(`${fragment}: expected a manifest with application children only; use module metadata for permissions`);
      return [match[1].trim()];
    }).join('\n');
    let merged = source.replace('<application', `${tags.join('\n')}\n    <application`);
    if (tags.some(tag => tag.includes('tools:')) && !merged.includes('xmlns:tools='))
      merged = merged.replace('<manifest', '<manifest xmlns:tools="http://schemas.android.com/tools"');
    if (application) merged = /<application\s*\/>/.test(merged)
      ? merged.replace(/<application\s*\/>/, `<application>\n${application}\n</application>`)
      : merged.replace('</application>', `${application}\n    </application>`);
    write(path.join(root, 'android/app/build/generated/valdi-module-manifest/AndroidManifest.xml'),
      merged);
  }
  const baseInfo = path.join(root, 'ios/ValdiRoutes/Info.plist');
  if (existsSync(baseInfo)) {
    const entries = entriesFor('iosInfoPlist');
    const source = readFileSync(baseInfo, 'utf8');
    for (const key of entries.keys()) {
      if (source.includes(`<key>${key}</key>`)) throw new Error(`Module privacy key ${key} must not also be declared in the App base Info.plist.`);
    }
    const closing = /<\/dict>\s*<\/plist>\s*$/;
    if (!closing.test(source)) throw new Error('App base Info.plist has no root dictionary.');
    const tags = [...entries].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `\t<key>${key}</key>\n\t<string>${xml(value)}</string>\n`).join('');
    const backgroundModes = [...new Set(modules.flatMap(module => module.iosBackgroundModes ?? []))].sort();
    if (backgroundModes.length && source.includes('<key>UIBackgroundModes</key>')) {
      throw new Error('Module background modes must not also be declared in the App base Info.plist.');
    }
    const background = backgroundModes.length
      ? `\t<key>UIBackgroundModes</key>\n\t<array>\n${backgroundModes.map(mode => `\t\t<string>${xml(mode)}</string>\n`).join('')}\t</array>\n`
      : '';
    write(path.join(root, 'ios/Generated/AppInfo.plist'), source.replace(closing, `${tags}${background}</dict>\n</plist>\n`));
  }
  const entitlements = [...entriesFor('iosEntitlements')].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `\t<key>${xml(key)}</key>\n\t<${value ? 'true' : 'false'}/>\n`).join('');
  write(path.join(root, 'ios/Generated/AppEntitlements.entitlements'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${entitlements}</dict>\n</plist>\n`);
  const packages = {};
  const dependencies = new Map();
  for (const module of modules) {
    for (const item of module.iosPackages ?? []) {
      const config = { url: item.url, ...(item.revision ? { revision: item.revision } : { from: item.from }) };
      if (packages[item.name] && JSON.stringify(packages[item.name]) !== JSON.stringify(config))
        throw new Error(`Conflicting iosPackages contribution: ${item.name}`);
      packages[item.name] = config;
      const dependency = { package: item.name, ...(item.product ? { product: item.product } : {}) };
      dependencies.set(JSON.stringify(dependency), dependency);
    }
    for (const name of module.iosFrameworks ?? []) dependencies.set(name, { sdk: `${name}.framework` });
  }
  // JSON is YAML. This overlay is included by XcodeGen, whose relative paths start in ios/Generated.
  const sources = modules.filter(module => module.nativeBuild === 'host' &&
    existsSync(path.join(root, `valdi/modules/${module.name}/ios`)))
    .flatMap(module => [
      { path: `../../valdi/modules/${module.name}/ios`, group: `Modules/${module.name}` },
      ...(existsSync(path.join(root, `valdi/modules/${module.name}/assets`))
        ? [{ path: `../../valdi/modules/${module.name}/assets`, group: `Modules/${module.name}`, buildPhase: 'resources' }]
        : []),
    ]);
  write(path.join(root, 'ios/Generated/Modules.yml'), `${JSON.stringify({
    packages, targets: { ValdiRoutes: { sources, dependencies: [...dependencies.values()] } },
  }, null, 2)}\n`);
}
