import { readFileSync } from 'node:fs';

// Executes the production scalar statements, with a deliberately tiny syntax
// translation. This checks their arithmetic/branches in JS, not C++ float ABI,
// native compilation, SDK layout or device behavior.
const header = new URL('../../../harmony/entry/src/main/cpp/host/HarmonySheetGeometry.hpp', import.meta.url);
const text = readFileSync(header, 'utf8');
const begin = '// SHEET_GEOMETRY_SCALAR_BEGIN';
const end = '// SHEET_GEOMETRY_SCALAR_END';
if (text.split(begin).length !== 2 || text.split(end).length !== 2) {
  throw new Error('Production geometry extraction markers must be unique');
}
const body = text.split(begin)[1].split(end)[0]
  .replace(/\/\/[^\n]*/g, '')
  .replace(/HarmonySheetGeometry g;/g, 'const g = {};')
  .replace(/const float /g, 'const ')
  .replace(/std::isfinite/g, 'Number.isFinite')
  .replace(/std::min/g, 'Math.min')
  .replace(/std::max/g, 'Math.max')
  .replace(/throw std::invalid_argument\(/g, 'throw new Error(')
  .replace(/(\d+(?:\.\d+)?)f\b/g, '$1');
if (/std::|\bfloat\b|HarmonySheetGeometry/.test(body)) {
  throw new Error('Geometry changed beyond the narrow scalar extractor; update deliberately');
}
export const computeProductionGeometry = new Function('m', body);
