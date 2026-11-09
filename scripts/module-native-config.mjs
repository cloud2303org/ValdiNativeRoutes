import path from 'node:path';

// Native contributions use module-relative paths, including local dependency packages
// elsewhere in this repository. Do not let a module accidentally name a host-machine path.
export function moduleNativePath(root, name, value) {
  if (typeof value !== 'string' || !value || /[\\\r\n";$]/.test(value) || path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value))
    throw new Error(`${name}: invalid native path ${JSON.stringify(value)}`);
  const resolved = path.resolve(root, 'valdi/modules', name, value);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error(`${name}: native path must stay inside the repository`);
  return resolved;
}

export function validateModuleNativeConfig(root, name, config) {
  // C++ implementations link into the runtime; app platform contributions would give them a second owner.
  // Binding names/language remain valid metadata for resolving declarations in other modules.
  if (config.nativeBuild === 'cpp') {
    const contribution = Object.keys(config).find(field => /^(android|ios)/.test(field) &&
      !['androidClassPath', 'iosModuleName', 'iosLanguage'].includes(field));
    if (contribution) throw new Error(`${name}: nativeBuild cpp cannot declare platform contribution ${contribution}`);
  }
  const checkPath = value => moduleNativePath(root, name, value);
  if (config.nativeDependencies !== undefined) {
    const dependency = config.nativeDependencies;
    if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency) ||
        Object.keys(dependency).some(key => !['script', 'inputs'].includes(key)) ||
        !Array.isArray(dependency.inputs))
      throw new Error(`${name}: invalid nativeDependencies`);
    checkPath(dependency.script);
    dependency.inputs.forEach(checkPath);
  }
  if (config.androidCmake !== undefined) checkPath(config.androidCmake);
  if (config.iosProjectSpec !== undefined) checkPath(config.iosProjectSpec);
  for (const field of ['nativeInputs', 'iosNativeSources', 'iosNativeFrameworks']) {
    if (config[field] === undefined) continue;
    if (!Array.isArray(config[field])) throw new Error(`${name}: invalid ${field}`);
    config[field].forEach(checkPath);
  }
  if (config.iosBuildSettings !== undefined) {
    const settings = config.iosBuildSettings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
        Object.entries(settings).some(([key, value]) =>
          !/^[A-Z][A-Z0-9_]*(?:\[sdk=[a-z*]+\])?$/.test(key) ||
          !(typeof value === 'string' || Array.isArray(value) && value.every(item => typeof item === 'string'))))
      throw new Error(`${name}: invalid iosBuildSettings`);
  }
}
