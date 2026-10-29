// Generation/Kotlin/KotlinValidation.swift and ViewModels/PropertyNameAllocator+Kotlin.swift.
import { PropertyNameAllocator } from '../PropertyNameAllocator';
import { trimmed } from '../Utils';

export const KotlinValidation = {
  /** Keywords generated identifiers (type names, properties, package name components) must avoid. */
  kotlinKeywords: [
    'as',
    'break',
    'class',
    'continue',
    'do',
    'else',
    'false',
    'for',
    'fun',
    'if',
    'in',
    'interface',
    'is',
    'null',
    'object',
    'package',
    'return',
    'super',
    'this',
    'throw',
    'true',
    'try',
    'typealias',
    'typeof',
    'val',
    'var',
    'when',
    'while',
  ],

  isValidAndroidTypeName(androidTypeName: string): boolean {
    if (!/^[a-z]+(\.[a-zA-Z_]\w*)*$/.test(androidTypeName)) return false;
    return androidTypeName.split('.').every(component => !KotlinValidation.kotlinKeywords.includes(trimmed(component)));
  },
};

/** PropertyNameAllocator.forKotlin(): the keywords and the builtin functions are taken. */
export function propertyNameAllocatorForKotlin(): PropertyNameAllocator {
  const allocator = new PropertyNameAllocator();
  for (const keyword of KotlinValidation.kotlinKeywords) allocator.allocate(keyword);
  allocator.allocate('toString');
  allocator.allocate('copy');
  return allocator;
}
