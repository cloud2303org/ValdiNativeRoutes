import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRuntimePatches } from '../upstream-runtime-patches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.resolve(process.argv[2] ?? path.join(root, '.tools/harmony/upstream'));
const core = 'src/valdi_modules/src/valdi/valdi_core';

applyRuntimePatches(source);

function replace(file, before, after) {
  const filename = path.join(source, file);
  const text = readFileSync(filename, 'utf8');
  if (text.includes(after)) return;
  if (text.split(before).length !== 2) {
    throw new Error(`Harmony patch does not match the pinned source: ${file}`);
  }
  writeFileSync(filename, text.replace(before, after));
}

replace('valdi_core/src/valdi_core/cpp/Context/PlatformType.hpp',
  'PlatformTypeWeb, PlatformTypeLinux };',
  'PlatformTypeWeb, PlatformTypeLinux, PlatformTypeHarmony };');
replace('valdi_core/valdi_core.djinni', '  skia;\n', '  skia;\n  harmony;\n');
replace('valdi_core/generated-src/cpp/valdi_core/Platform.hpp',
  '    Skia = 2,\n', '    Skia = 2,\n    Harmony = 3,\n');
replace('valdi_core/generated-src/cpp/valdi_core/Platform.hpp',
  '        "skia",\n', '        "skia",\n        "harmony",\n');
replace('valdi_core/valdi_core.djinni', '  dummy;\n', '  dummy;\n  imageHarmony;\n');
replace('valdi_core/generated-src/cpp/valdi_core/AssetOutputType.hpp',
  '    Dummy = 7,\n', '    Dummy = 7,\n    ImageHarmony = 8,\n');
replace('valdi_core/generated-src/cpp/valdi_core/AssetOutputType.hpp',
  '        "dummy",\n', '        "dummy",\n        "imageHarmony",\n');

replace('valdi/src/valdi/runtime/JavaScript/JavaScriptRuntime.cpp',
  '        case PlatformTypeLinux:\n            return callContext.getContext().newNumber(static_cast<int32_t>(5));',
  '        case PlatformTypeLinux:\n            return callContext.getContext().newNumber(static_cast<int32_t>(5));\n' +
  '        case PlatformTypeHarmony:\n            return callContext.getContext().newNumber(static_cast<int32_t>(6));');
replace('valdi/src/valdi/runtime/JavaScript/JavaScriptRuntime.cpp',
  '            case PlatformTypeAndroid:\n                result = kBackendRenderingTypeAndroid;',
  '            case PlatformTypeHarmony:\n                result = 4; // ArkUI native backend; shared with BackendRenderingType.HARMONY.\n                break;\n' +
  '            case PlatformTypeAndroid:\n                result = kBackendRenderingTypeAndroid;');
replace('valdi/src/valdi/runtime/JavaScript/JavaScriptRuntime.cpp',
  '    auto loadedAsset = castOrNull<LoadedAsset>(callContext.getParameterAsWrappedObject(0));',
  '    auto loadedAsset = castOrNull<LoadedAsset>(unwrapWrappedObject(\n' +
  '        callContext.getContext(), callContext.getParameter(0), callContext.getExceptionTracker()));');
const assetHandler = 'valdi/src/valdi/runtime/Context/ViewNodeAssetHandler.cpp';
replace(assetHandler,
  '    _asset = asset;\n    _loadedAsset = loadedAsset;\n    _onLoadCallback = onLoadCallback;',
  '    _asset = asset;\n    _onLoadCallback = onLoadCallback;');
replace(assetHandler,
  '    updateLoadObserver();\n\n    if (_viewNeedsUpdate) {',
  '    updateLoadObserver();\n\n' +
  '    // Observer teardown must finish before installing a direct loaded asset.\n' +
  '    if (asset == nullptr && _loadedAsset != loadedAsset) {\n' +
  '        _loadedAsset = loadedAsset;\n' +
  '        _viewNeedsUpdate = true;\n' +
  '    }\n\n    if (_viewNeedsUpdate) {');
replace('valdi/src/valdi/runtime/RuntimeManager.cpp',
  '            case PlatformTypeMacOS:\n            case PlatformTypeWeb:\n            case PlatformTypeLinux:',
  '            case PlatformTypeHarmony:\n                return nullptr; // The debugger transport has no Harmony protocol yet.\n' +
  '            case PlatformTypeMacOS:\n            case PlatformTypeWeb:\n            case PlatformTypeLinux:');

replace(`${core}/src/JSXBootstrap.ts`,
  '      this.currentPlatform !== 5\n',
  '      this.currentPlatform !== 5 &&\n      this.currentPlatform !== 6\n');
replace(`${core}/src/JSXBootstrap.ts`,
  '      let linuxClass: string | undefined;',
  '      let linuxClass: string | undefined;\n      let harmonyClass: string | undefined;');
replace(`${core}/src/JSXBootstrap.ts`,
  "        linuxClass = removeProperty(attributes, 'linuxClass');",
  "        linuxClass = removeProperty(attributes, 'linuxClass');\n        harmonyClass = removeProperty(attributes, 'harmonyClass');");
replace(`${core}/src/JSXBootstrap.ts`,
  '      // 1 = Android, 2 = iOS, 3 = MacOS, 4 = Web, 5 = Linux',
  "      if (this.currentPlatform === 6) {\n" +
  "        return harmonyClass ? new NodePrototype(className, harmonyClass, attributes)\n" +
  "          : new DeferredNodePrototype(className, attributes);\n" +
  "      }\n\n      // 1 = Android, 2 = iOS, 3 = MacOS, 4 = Web, 5 = Linux, 6 = Harmony");

replace(`${core}/src/utils/PropertyList.ts`,
  '    const index = propertyList.indexOf(property);\n' +
  '    if (index < 0 || index + 1 == propertyList.length) {\n' +
  '      return undefined;\n' +
  '    }\n' +
  '    const value = propertyList[index + 1];\n' +
  '    propertyList.splice(index, 2);\n' +
  '    return value;',
  '    // Flat property lists alternate keys and values. A value may equal the\n' +
  '    // requested key, and a dangling key is not a complete property.\n' +
  '    for (let index = 0; index + 1 < propertyList.length; index += 2) {\n' +
  '      if (propertyList[index] === property) {\n' +
  '        const value = propertyList[index + 1];\n' +
  '        propertyList.splice(index, 2);\n' +
  '        return value;\n' +
  '      }\n' +
  '    }\n' +
  '    return undefined;');

const attributes = 'valdi/src/valdi/runtime/Attributes/DefaultAttributes.cpp';
const text = readFileSync(path.join(source, attributes), 'utf8');
const linuxStart = text.indexOf('    binder.bind(\n        "linuxClass",');
const linuxBinding = text.slice(linuxStart, text.indexOf('\n\n', linuxStart) + 2);
replace(attributes, linuxBinding,
  linuxBinding + linuxBinding.replaceAll('"linuxClass"', '"harmonyClass"').replaceAll('PlatformTypeLinux', 'PlatformTypeHarmony'));

replace(`${core}/src/ValdiRuntime.d.ts`,
  '  SNAP_DRAWING = 3,\n', '  SNAP_DRAWING = 3,\n  HARMONY = 4,\n');
replace(`${core}/src/Asset.ts`, '  DUMMY = 7,\n', '  DUMMY = 7,\n  IMAGE_HARMONY = 8,\n');
const assetFile = path.join(source, core, 'src/Asset.ts');
const oldImageBranch = "        case BackendRenderingType.HARMONY:\n          throw new Error('ArkUI image asset loading is not implemented');";
if (readFileSync(assetFile, 'utf8').includes(oldImageBranch)) {
  writeFileSync(assetFile, readFileSync(assetFile, 'utf8').replace(oldImageBranch,
    '        case BackendRenderingType.HARMONY:\n          return AssetOutputType.IMAGE_HARMONY;'));
}
replace(`${core}/src/Asset.ts`,
  '    case AssetType.IMAGE:\n      switch (getValdiRuntime().getBackendRenderingTypeForContextId(contextId)) {',
  "    case AssetType.IMAGE:\n      switch (getValdiRuntime().getBackendRenderingTypeForContextId(contextId)) {\n" +
  "        case BackendRenderingType.HARMONY:\n          return AssetOutputType.IMAGE_HARMONY;");
replace(`${core}/src/Asset.ts`,
  '    case AssetType.VIDEO:\n      switch (getValdiRuntime().getBackendRenderingTypeForContextId(contextId)) {',
  "    case AssetType.VIDEO:\n      switch (getValdiRuntime().getBackendRenderingTypeForContextId(contextId)) {\n" +
  "        case BackendRenderingType.HARMONY:\n          throw new Error('ArkUI video asset loading is not implemented');");
replace(`${core}/src/DeviceBridge.d.ts`,
  "  ANDROID = 'android',", "  ANDROID = 'android',\n  HARMONY = 'harmony',");
replace(`${core}/src/Device.ts`,
  'export namespace Device {',
  'export namespace Device {\n  export function isHarmony(): boolean {\n    return cacheSystemType.get() === DeviceSystemType.HARMONY;\n  }\n');
replace('src/valdi_modules/src/valdi/valdi_tsx/src/JSX.ts',
  'export interface CustomView extends View {\n',
  'export interface CustomView extends View {\n  harmonyClass?: string;\n');

replace(`${core}/test/JSXPlatformTest.cjs`,
  'for (const platform of [0, 6, -1, NaN, \'5\'])',
  'for (const platform of [0, 7, -1, NaN, \'5\'])');
const testFile = path.join(source, core, 'test/JSXPlatformTest.cjs');
const harmonyTests = `
test('Harmony initializes JSX with independent ArkUI class names', () => {
  const jsx = loadPlatform(6);
  for (const tag of ['view', 'label', 'scroll', 'layout']) {
    assert.equal(jsx.makeNodePrototype(tag).viewClass, tag);
  }
});

test('Harmony custom views use only explicit Harmony classes', () => {
  const jsx = loadPlatform(6);
  for (const makeAttributes of [values => ({ ...values }), values => Object.entries(values).flat()]) {
    const attrs = makeAttributes({ harmonyClass: 'ArkCustom', iosClass: 'IOS', androidClass: 'Android' });
    assert.equal(jsx.makeNodePrototype('custom-view', attrs).viewClass, 'ArkCustom');
    assert.equal(jsx.makeNodePrototype('custom-view', makeAttributes({ androidClass: 'Android' })).viewClass, 'Deferred');
  }
});
`;
if (!readFileSync(testFile, 'utf8').includes("test('Harmony initializes JSX")) {
  writeFileSync(testFile, readFileSync(testFile, 'utf8') + harmonyTests);
}
// Harmony intentionally returns a null factory for unsupported native classes.
// Keep that nullable contract through cache maintenance, statistics and preloading.
const factories = 'valdi/src/valdi/runtime/Views/GlobalViewFactories.cpp';
replace(factories,
  '        it.second->clearViewPool();',
  '        if (it.second != nullptr) {\n            it.second->clearViewPool();\n        }');
replace(factories,
  '    if (it != _viewFactories.end()) {\n        return it->second;\n    }',
  '    if (it != _viewFactories.end() && it->second != nullptr) {\n        return it->second;\n    }');
replace(factories,
  '        if (existingIt != _viewFactories.end()) {',
  '        if (existingIt != _viewFactories.end() && existingIt->second != nullptr) {');
replace(factories,
  '        if (createdIt != _viewFactories.end()) {',
  '        if (createdIt != _viewFactories.end() && createdIt->second != nullptr) {');
replace(factories,
  '        if (replacementCreatedIt != _viewFactories.end()) {',
  '        if (replacementCreatedIt != _viewFactories.end() && replacementCreatedIt->second != nullptr) {');
replace(factories,
  '        _viewFactories[className] = viewFactory;\n        _viewFactories[replacementClassName] = viewFactory;',
  '        if (viewFactory != nullptr) {\n' +
  '            _viewFactories[className] = viewFactory;\n' +
  '            _viewFactories[replacementClassName] = viewFactory;\n' +
  '        }');
replace(factories,
  '        if (it != _viewFactories.end()) {\n            return it->second;\n        } else {\n' +
  '            _viewFactories[className] = viewFactory;\n            return viewFactory;\n        }',
  '        if (it != _viewFactories.end() && it->second != nullptr) {\n            return it->second;\n        }\n' +
  '        if (viewFactory != nullptr) {\n            _viewFactories[className] = viewFactory;\n        }\n' +
  '        return viewFactory;');
replace(factories,
  '        viewFactories.emplace_back(it.second);',
  '        if (it.second != nullptr) {\n            viewFactories.emplace_back(it.second);\n        }');
replace('valdi/src/valdi/runtime/Context/ViewManagerContext.cpp',
  '        stats[viewFactory->getViewClassName()] = viewFactory->getPoolSize();',
  '        if (viewFactory != nullptr) {\n' +
  '            stats[viewFactory->getViewClassName()] = viewFactory->getPoolSize();\n        }');

const preloader = 'valdi/src/valdi/runtime/Views/ViewPreloader.cpp';
replace('valdi/src/valdi/runtime/Views/ViewPreloader.hpp',
  '    bool _preloading = false;',
  '    // Distinguish canceled requests from same-class requests issued during factory resolution.\n' +
  '    size_t _preloadCancellationGeneration = 0;\n    bool _preloading = false;');
replace(preloader,
  'void ViewPreloader::stopPreload() {\n    std::lock_guard<std::mutex> lock(_mutex);',
  'void ViewPreloader::stopPreload() {\n    std::lock_guard<std::mutex> lock(_mutex);\n' +
  '    ++_preloadCancellationGeneration;');
replace(preloader,
  '        StringBox className;\n        {',
  '        StringBox className;\n        size_t cancellationGeneration;\n        {');
replace(preloader,
  '            className = _preloadCountByClassName.begin()->first;',
  '            className = _preloadCountByClassName.begin()->first;\n' +
  '            cancellationGeneration = _preloadCancellationGeneration;');
replace(preloader,
  '        auto poolSize = viewFactory->getPoolSize();',
  '        auto poolSize = viewFactory != nullptr ? viewFactory->getPoolSize() : 0;');
replace(preloader,
  '        if (it == _preloadCountByClassName.end()) {\n' +
  '            // stopPreload() removed this entry while the factory was being resolved\n            continue;\n        }\n' +
  '        if (poolSize < it->second) {',
  '        if (it == _preloadCountByClassName.end() ||\n' +
  '            cancellationGeneration != _preloadCancellationGeneration) {\n' +
  '            // A canceled request must not consume a new same-class request.\n            continue;\n        }\n' +
  '        if (viewFactory == nullptr) {\n' +
  '            // Unsupported classes cannot fill a pool. Retire only this request so the\n' +
  '            // remaining supported classes can progress without endless rescheduling.\n' +
  '            _preloadCountByClassName.erase(it);\n            continue;\n        }\n' +
  '        if (poolSize < it->second) {');
console.log(`Applied Harmony platform overlay to ${source}`);
