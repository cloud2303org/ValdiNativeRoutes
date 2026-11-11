import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { appModule, root } from './pipeline';
import { findFonts, findImages, writeResTs } from './resources';
import { valdiTs } from './valdiTs';

const modules = path.join(root, 'valdi/modules');

/** Include erased type dependencies, re-exports and literal runtime module lookups. */
function imports(source: ts.SourceFile): string[] {
  const result: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      result.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
      result.push(node.moduleReference.expression.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)) {
      result.push(node.argument.literal.text);
    } else if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          ts.isIdentifier(node.expression) && node.expression.text === 'require' ||
          ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'load') &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      result.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

test('foundation has no direct or transitive dependency on business pages, including types and native contracts', t => {
  const compiler = valdiTs(appModule('app_foundation'));
  t.after(() => compiler.dispose());
  const program = compiler.program();
  const options = program.getCompilerOptions();
  const own = program.getSourceFiles().filter(source =>
    source.fileName.startsWith(path.join(modules, 'app_foundation/src') + path.sep));
  assert.ok(own.length > 0, 'the actual foundation sources must be inspected');
  const visited = new Set<string>();
  const visit = (file: string, chain: string[]) => {
    if (visited.has(file)) return;
    visited.add(file);
    const source = program.getSourceFile(file) ??
      ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const specifier of imports(source)) {
      const route = [...chain, path.relative(modules, file), specifier];
      assert.doesNotMatch(specifier, /^app_pages(?:\/|$)/, route.join(' -> '));
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
      if (!resolved) {
        assert.ok(!specifier.startsWith('.') && !specifier.startsWith('app_foundation/'),
          `unresolved local dependency: ${route.join(' -> ')}`);
        continue;
      }
      const relative = path.relative(modules, resolved.resolvedFileName);
      assert.ok(relative !== 'app_pages' && !relative.startsWith(`app_pages${path.sep}`), route.join(' -> '));
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) visit(resolved.resolvedFileName, route);
    }
  };
  for (const source of own) visit(source.fileName, []);
});

test('feature route metadata uses canonical feature IDs without evaluating features or acquiring native hosts', async t => {
  const generated = mkdtempSync(path.join(tmpdir(), 'valdi-organization-routes-'));
  t.after(() => rmSync(generated, { recursive: true, force: true }));
  const app = { ...appModule('app_pages'), generatedDirs: [generated] };
  writeResTs(app, await findImages(app), generated, findFonts(app));
  const compiler = valdiTs(app, ts.ModuleKind.CommonJS);
  t.after(() => compiler.dispose());
  const routeFile = path.join(app.dir, 'src/routes.ts');
  const emitted = compiler.emit(routeFile);
  assert.doesNotMatch(emitted, /require\(["'][^"']*\/features\//);
  const loaded: string[] = [];
  const cache = new Map<string, any>();
  const context = vm.createContext({});
  const load = (id: string): any => {
    if (cache.has(id)) return cache.get(id);
    if (id === 'valdi_core/src/NativeReferences') return {
      withGlobalNativeRefs: () => assert.fail('declaring routes must not acquire native references'),
    };
    if (id === 'app_foundation/src/host/AppContext') return {
      getHost: () => assert.fail('declaring routes must not acquire the native host'),
    };
    assert.ok(id === 'app_pages/src/routes' || id.startsWith('app_foundation/src/navigation/'),
      `route declaration evaluated an unexpected dependency: ${id}`);
    loaded.push(id);
    const file = path.join(modules, `${id}.ts`);
    const code = id === 'app_pages/src/routes' ? emitted : ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} as any };
    cache.set(id, module.exports);
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: file })(
      (name: string) => load(name.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(id), name)) : name),
      module, module.exports,
    );
    return module.exports;
  };
  const declaration = load('app_pages/src/routes').routes.toHost();
  const expected: string[] = [];
  for (const statement of compiler.program().getSourceFile(routeFile)!.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.moduleSpecifier.text.startsWith('./features/')) continue;
    const componentPath = `app_pages/src/${statement.moduleSpecifier.text.slice(2)}`;
    const clause = statement.importClause;
    // Feature-owned parameter types are erased; only runtime imports declare page components.
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) expected.push(`default@${componentPath}`);
    const bindings = clause.namedBindings;
    if (bindings) {
      assert.ok(ts.isNamedImports(bindings));
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) expected.push(`${element.propertyName?.text ?? element.name.text}@${componentPath}`);
      }
    }
  }
  assert.ok(expected.length > 0, 'actual feature imports must be checked');
  const components = Array.from(declaration.routes, (route: any) => route.component)
    .filter((component: unknown): component is string =>
      typeof component === 'string' && component.includes('@app_pages/'));
  assert.deepEqual(components.sort(), expected.sort());
  assert.equal(declaration.root, '$tabs');
  assert.equal(declaration.routes.find((route: any) => route.route === 'picker').nativeName, 'picker');
  assert.equal(declaration.routes.find((route: any) => route.route === 'calculator').component,
    'CalculatorComponent@calculator/src/CalculatorComponent');
  assert.deepEqual(loaded, [
    'app_pages/src/routes',
    'app_foundation/src/navigation/config',
    'app_foundation/src/navigation/NavigationHost',
  ]);
});
