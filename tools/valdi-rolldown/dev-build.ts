// The dev server's build state, without device discovery or socket connections.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ArchiveEntries } from './archive';
import type { DevResource } from './dev-protocol';
import { prepareStrings, type LocalizedStrings } from './localization';
import { assertEnabledImports } from './module-selection';
import { availableModuleNames } from './modules.mjs';
import { buildModule, genDir, inlineSourceMaps, modulesDir, root } from './pipeline';
import { addFontEntries, assetCatalog, findFonts, findImages, writeResTs, type Font, type Image } from './resources';
import { sourceFiles, valdiTs, type ValdiModule } from './valdiTs';

/** What changed since the last build, per module. */
export interface Pending {
  files: Set<string>;
  res: boolean;
  strings: boolean;
}

/** Includes a strings/ directory rename/removal, whose notification need not name a JSON file. */
export function recordChange(pending: Map<string, Pending>, names: ReadonlyMap<string, unknown>, directory: string, file: string): boolean {
  const [name, dir] = file.split(path.sep);
  if (!names.has(name)) return false;
  const changes = pending.get(name) ?? { files: new Set<string>(), res: false, strings: false };
  if (dir === 'src' && /\.tsx?$/.test(file)) changes.files.add(path.join(directory, file));
  else if (dir === 'res') changes.res = true;
  else if (dir === 'strings') changes.strings = true;
  else return false;
  pending.set(name, changes);
  return true;
}

/** One module: its resources, generated sources and TypeScript program, kept between builds. */
export class ModuleBuild {
  private images: Image[] | undefined;
  private fonts: Font[] = [];
  private strings: LocalizedStrings | undefined;
  private compilation: ReturnType<typeof valdiTs> | undefined;
  lastDiagnostics: string | undefined;

  private constructor(readonly module: ValdiModule, images: Image[] | undefined, readonly generatedDir: string) {
    this.updateResources(images);
  }

  get plugin(): ReturnType<typeof valdiTs> {
    if (!this.compilation) {
      // Initial JSON errors belong to the watched build, after the watcher is
      // registered, so fixing an invalid file can recover without restarting.
      this.strings = prepareStrings(this.module, this.generatedDir);
      this.compilation = valdiTs(this.module, undefined, true);
    }
    return this.compilation;
  }

  static async create(module: ValdiModule, generatedDir = genDir(module.name)): Promise<ModuleBuild> {
    return new ModuleBuild(module, await findImages(module), generatedDir);
  }

  async loadResources() {
    this.updateResources(await findImages(this.module));
    // Tab references compile to native image descriptors, including bytes in development builds.
    for (const file of sourceFiles(this.module)) this.plugin.invalidate(file);
  }

  /** Regenerate before any program asks for diagnostics, including programs importing this module. */
  loadStrings(): string[] {
    const previous = this.strings?.generatedFile;
    this.strings = prepareStrings(this.module, this.generatedDir);
    return [...new Set([
      path.join(this.module.dir, 'src/Strings.ts'),
      path.join(this.generatedDir, 'src/Strings.ts'),
      ...(previous ? [previous] : []),
      ...(this.strings ? [this.strings.generatedFile] : []),
    ])];
  }

  private updateResources(images: Image[] | undefined) {
    this.images = images;
    this.fonts = findFonts(this.module) ?? [];
    if (writeResTs(this.module, images, this.generatedDir, this.fonts)) {
      this.compilation?.invalidate(path.join(this.generatedDir, 'res.ts'));
    }
  }

  async build(enabled: string[]): Promise<ArchiveEntries> {
    // Program roots use the real generated paths rather than sourceFiles()' virtual IDs.
    assertEnabledImports([...this.plugin.program().getRootFileNames()], modulesDir, availableModuleNames(root), enabled);
    const diagnostics = this.plugin.diagnostics();
    if (diagnostics) throw new Error(diagnostics);
    const { images, fonts } = this;
    const built = await buildModule(this.module, this.plugin, false);
    inlineSourceMaps(built);
    if (images || fonts.length) {
      built.entries.set('res.assetcatalog', assetCatalog(images ?? [], fonts));
      for (const image of images ?? []) built.entries.set(`res/${image.name}.${image.extension}`, readFileSync(image.file));
    }
    addFontEntries(built.entries, fonts);
    if (diagnostics !== this.lastDiagnostics) {
      console.log(diagnostics || `✓ ${this.module.name}: no type errors`);
      this.lastDiagnostics = diagnostics;
    }
    return built.entries;
  }
}

/** Outputs advance together after diagnostics and every selected build succeed. */
export class DevBuild {
  private readonly current = new Map<string, ArchiveEntries>();
  private readonly pending = new Map<string, Pending>();

  constructor(readonly modules: Map<string, ModuleBuild>) {}

  async rebuild(batch: Map<string, Pending>): Promise<DevResource[]> {
    // A producer edit can fail on a consumer's diagnostics. Keep both until the
    // fix builds successfully, so that fix also publishes the pending producer.
    for (const [name, changes] of batch) {
      const previous = this.pending.get(name);
      this.pending.set(name, {
        files: new Set([...(previous?.files ?? []), ...changes.files]),
        res: !!previous?.res || changes.res,
        strings: !!previous?.strings || changes.strings,
      });
    }
    const files = new Set([...this.pending.values()].flatMap(changes => [...changes.files]));
    for (const [name, changes] of this.pending) {
      const module = this.modules.get(name)!;
      if (changes.res) await module.loadResources();
      if (changes.strings) for (const file of module.loadStrings()) files.add(file);
    }
    // Consumers may resolve Strings through its virtual module ID or its real generated path.
    // Refresh every program before checking any of them, even if its own sources did not change.
    const stringsChanged = [...this.pending.values()].some(changes => changes.strings);
    const plugins = [...this.modules.values()].map(module => module.plugin);
    for (const plugin of plugins) {
      // TypeScript can retain a failed import lookup when the first Strings
      // source appears. Refresh importers too so that lookup is resolved again.
      const importers = stringsChanged ? plugin.program().getRootFileNames() : [];
      for (const file of new Set([...files, ...importers])) plugin.invalidate(file);
    }
    const changed = await this.build(this.current.size ? this.pending.keys() : this.modules.keys());
    this.pending.clear();
    return changed;
  }

  async build(names: Iterable<string> = this.modules.keys()): Promise<DevResource[]> {
    const started = performance.now();
    // Prepare every producer before any consumer's program resolves its imports.
    const plugins = [...this.modules.values()].map(module => module.plugin);
    for (const plugin of plugins) {
      const diagnostics = plugin.diagnostics();
      if (diagnostics) throw new Error(diagnostics);
    }
    const changed: DevResource[] = [];
    const staged = new Map<string, ArchiveEntries>();
    for (const name of names) {
      const entries = await this.modules.get(name)!.build([...this.modules.keys()]);
      const before = this.current.get(name);
      for (const [file, data] of entries) {
        if (!before?.get(file)?.equals(data)) changed.push({ bundle: name, file, data });
      }
      staged.set(name, entries);
    }
    for (const [name, entries] of staged) this.current.set(name, entries);
    console.log(`Built in ${Math.round(performance.now() - started)} ms, ${changed.length} file(s) changed`);
    return changed;
  }

  allResources(): DevResource[] {
    return [...this.current].flatMap(([bundle, entries]) => [...entries].map(([file, data]) => ({ bundle, file, data })));
  }
}
