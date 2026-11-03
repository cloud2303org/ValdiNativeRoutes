import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ValdiModule } from './valdiTs';

/** Page and custom tab-bar references are metadata, never eager imports of implementations or native Asset objects. */
export function routeTransformer(
  checker: ts.TypeChecker, module: ValdiModule, inlineIcons = false,
): ts.TransformerFactory<ts.SourceFile> {
  return context => source => {
    const f = context.factory;
    let changed = false;
    const fail = (node: ts.Node, message: string): never => {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      throw new Error(`${source.fileName}:${position.line + 1}:${position.character + 1}: ${message}`);
    };
    const symbol = (node: ts.Node) => {
      const found = checker.getSymbolAtLocation(node);
      return found && (found.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(found) : found);
    };
    const isHelper = (node: ts.Expression, name: string) => symbol(node)?.declarations?.some(declaration =>
      ts.isFunctionDeclaration(declaration) && declaration.name?.text === name &&
      declaration.getSourceFile().fileName.replaceAll('\\', '/').endsWith('/navigation/config.ts'));
    const componentPath = (node: ts.Expression, field = 'valdiPage.component'): string => {
      const declaration = symbol(node)?.declarations?.find(ts.isClassDeclaration);
      if (!declaration?.name || !ts.getJSDocTags(declaration).some(tag => tag.tagName.text === 'Component')) {
        return fail(node, `${field} must reference an exported @Component class`);
      }
      const file = declaration.getSourceFile().fileName;
      const local = path.relative(module.dir, file);
      const parts = file.replaceAll('\\', '/').match(/\/([^/]+)\/(src\/.*)\.tsx?$/);
      const owner = !local.startsWith('..') ? module.name : parts?.[1];
      const relative = !local.startsWith('..') ? local.replaceAll('\\', '/').replace(/\.tsx?$/, '') : parts?.[2];
      if (!owner || !relative) return fail(node, 'Cannot resolve the component module');
      if (!(ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export)) {
        return fail(node, 'Route components must be exported');
      }
      const member = ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Default ? 'default' : declaration.name.text;
      return `${member}@${owner}/${relative}`;
    };
    const icon = (node: ts.Expression): ts.Expression => {
      if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) {
        return fail(node, 'Tab icons must directly reference app_pages/res, for example res.tabHome');
      }
      const binding = checker.getSymbolAtLocation(node.expression)?.declarations?.[0];
      const imported = binding && ts.isImportClause(binding) ? binding.parent : undefined;
      if (!imported || !ts.isStringLiteral(imported.moduleSpecifier) || imported.moduleSpecifier.text !== 'app_pages/res') {
        return fail(node, 'Tab icons must come from app_pages/res');
      }
      const directory = path.join(module.dir, 'res');
      const candidates = readdirSync(directory).flatMap(file => {
        const match = file.match(/^(.+?)(?:@(\d+(?:\.\d+)?)x)?\.(png|webp)$/);
        if (!match) return [];
        const name = match[1].replaceAll('-', '_');
        const key = name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
        return key === node.name.text ? [{ file, name, scale: Number(match[2] ?? 1) }] : [];
      }).sort((a, b) => b.scale - a.scale);
      const image = candidates[0];
      if (!image) return fail(node, `Unknown Tab image: ${node.getText(source)}`);
      return f.createObjectLiteralExpression([
        f.createPropertyAssignment('name', f.createStringLiteral(image.name)),
        ...(inlineIcons ? [f.createPropertyAssignment('data',
          f.createStringLiteral(readFileSync(path.join(directory, image.file)).toString('base64')))] : []),
      ]);
    };
    const transformConfig: ts.Visitor = node => {
      if (ts.isCallExpression(node) && isHelper(node.expression, 'valdiPage')) {
        const config = node.arguments[0];
        if (!config || !ts.isObjectLiteralExpression(config)) return fail(node, 'valdiPage requires an object literal');
        changed = true;
        let found = false;
        const properties = config.properties.map(property => {
          if (ts.isPropertyAssignment(property) && property.name.getText(source) === 'component') {
            found = true;
            return f.updatePropertyAssignment(property, property.name, f.createStringLiteral(componentPath(property.initializer)));
          }
          return property;
        });
        if (!found) return fail(config, 'valdiPage requires component');
        return f.updateCallExpression(node, node.expression, node.typeArguments, [f.updateObjectLiteralExpression(config, properties)]);
      }
      if (ts.isPropertyAssignment(node) && ['icon', 'selectedIcon'].includes(node.name.getText(source))) {
        changed = true;
        return f.updatePropertyAssignment(node, node.name, icon(node.initializer));
      }
      return ts.visitEachChild(node, transformConfig, context);
    };
    const visit: ts.Visitor = node => {
      if (ts.isCallExpression(node) && isHelper(node.expression, 'defineRoutes')) {
        const config = node.arguments[0];
        if (!config || !ts.isObjectLiteralExpression(config)) return fail(node, 'defineRoutes requires an object literal');
        const propertyName = (name: ts.PropertyName) =>
          ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
        const property = (object: ts.ObjectLiteralExpression, key: string) =>
          object.properties.find((p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) && propertyName(p.name) === key)?.initializer;
        const pages = property(config, 'pages');
        if (!pages || !ts.isObjectLiteralExpression(pages)) return fail(config, 'pages must be an object literal');
        const names = new Set(pages.properties.map(p => {
          if (!ts.isPropertyAssignment(p) || (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name)) || !p.name.text) {
            return fail(p, 'Declare each page with a named valdiPage() or nativePage() entry');
          }
          if (!ts.isCallExpression(p.initializer) ||
            (!isHelper(p.initializer.expression, 'valdiPage') && !isHelper(p.initializer.expression, 'nativePage'))) {
            return fail(p, 'Pages must use valdiPage() or nativePage(); legacy route JSON is not supported');
          }
          return p.name.text;
        }));
        if (!names.size) return fail(pages, 'pages must contain at least one page');
        if (names.size !== pages.properties.length) return fail(pages, 'Duplicate page name');
        if (names.has('$tabs')) return fail(pages, '$tabs is reserved');
        const initialPage = property(config, 'initial');
        if (initialPage && (!ts.isStringLiteral(initialPage) || !names.has(initialPage.text))) {
          return fail(initialPage, 'initial must name a declared page');
        }
        const tabs = property(config, 'tabs');
        let transformedConfig = config;
        if (tabs) {
          if (!ts.isObjectLiteralExpression(tabs)) return fail(tabs, 'tabs must be an object literal');
          const items = property(tabs, 'items');
          if (!items || !ts.isArrayLiteralExpression(items) || !items.elements.length) {
            return fail(tabs, 'tabs.items must be a non-empty array literal');
          }
          const seen = new Set<string>();
          for (const item of items.elements) {
            const route = ts.isObjectLiteralExpression(item) ? property(item, 'route') : undefined;
            if (!route || !ts.isStringLiteral(route)) return fail(item, 'Each Tab must reference a literal route name');
            if (!names.has(route.text)) return fail(route, `Unknown route in tabs: "${route.text}"`);
            if (seen.has(route.text)) return fail(route, `Duplicate tab: "${route.text}"`);
            seen.add(route.text);
          }
          const initial = property(tabs, 'initial');
          if (initial && (!ts.isStringLiteral(initial) || !seen.has(initial.text))) {
            return fail(initial, 'tabs.initial must name a route in tabs.items');
          }
          const bar = property(tabs, 'bar');
          if (bar) {
            if (!ts.isObjectLiteralExpression(bar)) return fail(bar, 'tabs.bar must be an object literal');
            const keys = new Set<string>();
            for (const entry of bar.properties) {
              if (!ts.isPropertyAssignment(entry) || !propertyName(entry.name)) {
                return fail(entry, 'tabs.bar must explicitly declare type and component without spreads');
              }
              const key = propertyName(entry.name)!;
              if (keys.has(key)) return fail(entry, `Duplicate tabs.bar property: "${key}"`);
              if (key !== 'type' && key !== 'component') return fail(entry, `Unknown tabs.bar property: "${key}"`);
              keys.add(key);
            }
            const type = property(bar, 'type');
            if (!type || !ts.isStringLiteral(type) || !['default', 'custom'].includes(type.text)) {
              return fail(bar, 'tabs.bar.type must be default or custom');
            }
            const component = property(bar, 'component');
            if (type.text === 'default' && component) {
              return fail(component, 'tabs.bar.component is only allowed for custom bars');
            }
            if (type.text === 'custom') {
              if (!component) return fail(bar, 'tabs.bar.component is required for custom bars');
              const canonical = componentPath(component, 'tabs.bar.component');
              const transformedBar = f.updateObjectLiteralExpression(bar, bar.properties.map(entry =>
                ts.isPropertyAssignment(entry) && propertyName(entry.name) === 'component'
                  ? f.updatePropertyAssignment(entry, entry.name, f.createStringLiteral(canonical)) : entry));
              const transformedTabs = f.updateObjectLiteralExpression(tabs, tabs.properties.map(entry =>
                ts.isPropertyAssignment(entry) && propertyName(entry.name) === 'bar'
                  ? f.updatePropertyAssignment(entry, entry.name, transformedBar) : entry));
              transformedConfig = f.updateObjectLiteralExpression(config, config.properties.map(entry =>
                ts.isPropertyAssignment(entry) && propertyName(entry.name) === 'tabs'
                  ? f.updatePropertyAssignment(entry, entry.name, transformedTabs) : entry));
              changed = true;
            }
          }
        }
        return ts.visitEachChild(f.updateCallExpression(node, node.expression, node.typeArguments,
          [transformedConfig, ...node.arguments.slice(1)]), transformConfig, context);
      }
      // valdiPage is also usable in a separately exported page declaration.
      if (ts.isCallExpression(node) && isHelper(node.expression, 'valdiPage')) return transformConfig(node);
      return ts.visitEachChild(node, visit, context);
    };
    let output = ts.visitNode(source, visit) as ts.SourceFile;
    if (!changed) return output;
    // TS has already marked original imports as used. Explicitly remove references consumed as route metadata.
    const used = new Set<string>();
    const collect = (node: ts.Node) => {
      if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)) {
        // Legacy decorators on declare properties still execute in runtime classes.
        // Ambient classes/namespaces stop here before visiting any of their members.
        if (ts.isPropertyDeclaration(node) && context.getCompilerOptions().experimentalDecorators) {
          const decorators = ts.getDecorators(node);
          if (decorators?.length) {
            decorators.forEach(collect);
            if (ts.isComputedPropertyName(node.name)) collect(node.name.expression);
          }
        }
        return;
      }
      if (ts.isImportDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;
      if ((ts.isExportDeclaration(node) || ts.isExportSpecifier(node)) && node.isTypeOnly) return;
      if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) return;
      // Erased types cannot keep metadata imports alive. ExpressionWithTypeArguments also
      // represents runtime class extends / instantiation expressions: visit their expression.
      if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return;
      if (ts.isIdentifier(node)) used.add(node.text);
      ts.forEachChild(node, collect);
    };
    collect(output);
    output = f.updateSourceFile(output, output.statements.flatMap(statement => {
      if (!ts.isImportDeclaration(statement) || !statement.importClause) return [statement];
      const clause = statement.importClause;
      if (clause.isTypeOnly) return [];
      const name = clause.name && used.has(clause.name.text) ? clause.name : undefined;
      let bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const elements = bindings.elements.filter(element => used.has(element.name.text));
        bindings = elements.length ? f.updateNamedImports(bindings, elements) : undefined;
      } else if (bindings && !used.has(bindings.name.text)) bindings = undefined;
      if (!name && !bindings) return [];
      return [f.updateImportDeclaration(statement, statement.modifiers,
        f.updateImportClause(clause, clause.isTypeOnly, name, bindings), statement.moduleSpecifier, statement.attributes)];
    }));
    return output;
  };
}
