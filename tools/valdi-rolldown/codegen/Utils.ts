// What the Valdi compiler's generators share from its Utils/ (String+Trim.swift, String+JS.swift,
// FileHeaderCommentGenerator.swift, ComponentPath.swift, GeneratedSourceFilename.swift, CompilerError). The output has
// to match byte for byte, so these follow Foundation's semantics rather than JavaScript's where the two differ: Swift's
// CharacterSet.whitespacesAndNewlines is not \s (it has U+0085 and lacks U+FEFF).

/** CharacterSet.whitespacesAndNewlines, as a regex character class body: Zs, Zl, Zp, U+0009–U+000D and U+0085. */
export const WHITESPACES_AND_NEWLINES =
  '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';

/** A trimmingCharacters(in:) for a character class body (regex syntax, as WHITESPACES_AND_NEWLINES). */
export function trimmingCharacters(str: string, characterClass: string): string {
  return str.replace(new RegExp(`^[${characterClass}]+|[${characterClass}]+$`, 'gu'), '');
}

/** String.trimmed. */
export const trimmed = (str: string) => trimmingCharacters(str, WHITESPACES_AND_NEWLINES);

/** components(separatedBy: CharacterSet.newlines): every newline scalar splits, so \r\n gives an empty component. */
export const componentsSeparatedByNewlines = (str: string) => str.split(/[\n\v\f\r\u0085\u2028\u2029]/);

/** String.removing(suffixes:), in order, as for FileExtensions.typescriptFileExtensionsDotted. */
export function removingSuffixes(str: string, suffixes: string[]): string {
  let current = str;
  for (const suffix of suffixes) {
    if (current.endsWith(suffix)) current = current.slice(0, current.length - suffix.length);
  }
  return current;
}

/** NSString.deletingPathExtension: `app_pages/src/Page.tsx` → `app_pages/src/Page`. */
export const deletingPathExtension = (file: string) => file.replace(/(?<=[^/])\.[^./]*$/, '');

/** FileExtensions.typescriptFileExtensionsDotted. */
export const TYPESCRIPT_FILE_EXTENSIONS_DOTTED = ['.d.ts', '.ts', '.tsx'];

/** String.asValdiAttributeKey: '-' and '_' are dropped and upper-case the next letter; only [a-zA-Z0-9:] stays. */
function asValdiAttributeKey(str: string): string {
  let out = '';
  let shouldUpper = false;
  for (const scalar of str) {
    if (scalar === '-' || scalar === '_') {
      if (out) shouldUpper = true;
      continue;
    }
    let c = scalar;
    if (shouldUpper) {
      shouldUpper = false;
      if (c >= 'a' && c <= 'z') c = c.toUpperCase();
    }
    if (/^[a-zA-Z0-9:]$/.test(c)) out += c;
  }
  return out;
}

export function pascalCased(str: string): string {
  const key = asValdiAttributeKey(str);
  return key ? key[0].toUpperCase() + key.slice(1) : key;
}

export function camelCased(str: string): string {
  const key = asValdiAttributeKey(str);
  return key ? key[0].toLowerCase() + key.slice(1) : key;
}

/**
 * The compiler's own Character.isUppercase (String+Trim.swift): anything that isn't a lower-case letter, so digits
 * count as upper case.
 */
export const isUppercase = (character: string) => !/^\p{Ll}*$/u.test(character);

/** Collection.nonEmpty. */
export const nonEmpty = (str: string | undefined): string | undefined => (str ? str : undefined);

/**
 * String.indented(indentPattern:) (String+JS.swift), which every generator runs its output through: each line is
 * trimmed and indented again by its brace depth, leading empty lines are dropped and runs of empty lines collapse into
 * one. Braces in comments count too.
 */
export function indented(str: string, indentPattern: string): string {
  let indentCount = 0;
  const outLines: string[] = [];
  let previousWasEmptyLine = true;
  for (const line of str.split('\n')) {
    const trimmedLine = trimmed(line);
    if (!trimmedLine) {
      if (previousWasEmptyLine) continue;
      outLines.push('\n');
      previousWasEmptyLine = true;
      continue;
    }
    previousWasEmptyLine = false;

    let newIndent = indentCount;
    let index = 0;
    for (const c of trimmedLine) {
      if (c === '{') {
        newIndent += 1;
      } else if (c === '}') {
        newIndent -= 1;
        if (index === 0) indentCount -= 1;
      }
      index++;
    }
    // indentCount may be < 0 if the syntax is invalid -- we still shouldn't crash:
    indentCount = Math.max(0, indentCount);
    const indent = indentPattern.repeat(indentCount);
    indentCount = newIndent;
    outLines.push(indent + trimmedLine + '\n');
  }
  return outLines.join('');
}

export class CompilerError extends Error {}

export interface TypeScriptItemSrc {
  /** The file as the compiler names it: `<module>/<path in the module>` (`app_pages/src/Page.ts`). */
  compilationPath: string;
  /** Where it is on disk. */
  sourceURL: string;
}

export interface GeneratedSourceFilename {
  filename: string;
  symbolName: string;
  src: TypeScriptItemSrc;
}

export interface ComponentPath {
  fileName: string;
  exportedMember: string;
}

/**
 * JSThreadDispatchAttribution.generatedFunction (Generation/ExportedFunctionGenerator.swift): what generated
 * invokeWithJSRuntime methods tell the JS thread.
 */
export const generatedFunctionAttribution = (bundleName: string, modulePath: string, functionName: string) =>
  `generated.invokeWithJSRuntime:${bundleName}/${modulePath}#${functionName}`;

export const componentPathString = (componentPath: ComponentPath) =>
  `${componentPath.exportedMember}@${componentPath.fileName}`;

export const FileHeaderCommentGenerator = {
  generateMultilineComment(comment: string): string {
    const commentLines = comment
      .split('\n')
      .map(line => `* ${line}`)
      .join('\n');
    return `/**\n${commentLines}\n*/`;
  },

  generateHeaderMessage(sourceFilename: GeneratedSourceFilename): string {
    return (
      `Generated from type '${sourceFilename.symbolName}' at '${sourceFilename.filename}' by the Valdi compiler.\n` +
      'Please do not edit this file directly.'
    );
  },

  generateFactoryHeaderMessage(className: string, sourceFilename: GeneratedSourceFilename): string {
    const commentMessage =
      `Generated factory for '${className}' at '${sourceFilename.filename}' by the Valdi compiler.\n` +
      'Needed for native dependency injection.\n' +
      'Please do not edit this file directly.';
    return FileHeaderCommentGenerator.generateMultilineComment(commentMessage);
  },

  generateComment(sourceFilename: GeneratedSourceFilename, additionalComments?: string): string {
    let commentMessage = FileHeaderCommentGenerator.generateHeaderMessage(sourceFilename);
    if (additionalComments) commentMessage = `${additionalComments}\n\n${commentMessage}`;
    return FileHeaderCommentGenerator.generateMultilineComment(commentMessage);
  },
};
