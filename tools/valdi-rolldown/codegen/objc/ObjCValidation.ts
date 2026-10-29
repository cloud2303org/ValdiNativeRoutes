// Generation/ObjC/ObjCValidation.swift and ViewModels/PropertyNameAllocator+ObjC.swift.
import { PropertyNameAllocator } from '../PropertyNameAllocator';

export const ObjCValidation = {
  /** Keywords generated identifiers (type names, properties) must avoid. */
  objcKeywords: [
    // additional
    'description',

    // hard
    'asm',
    'auto',
    'break',
    'case',
    'char',
    'const',
    'continue',
    'default',
    'do',
    'double',
    'else',
    'enum',
    'extern',
    'float',
    'for',
    'goto',
    'if',
    'inline',
    'int',
    'long',
    'register',
    'restrict',
    'return',
    'short',
    'signed',
    'sizeof',
    'static',
    'struct',
    'switch',
    'typedef',
    'union',
    'unsigned',
    'void',
    'volatile',
    '_Bool',
    '_Complex',
    '_Imaginary',
    '__block',

    // soft
    'BOOL',
    'Class',
    'bycopy',
    'byref',
    'id',
    'IMP',
    'in',
    'In',
    'inout',
    'nil',
    'Nil',
    'NO',
    'NULL',
    'oneway',
    'out',
    'Protocol',
    'SEL',
    'self',
    'super',
    'YES',
    '@interface',
    '@end',
    '@implementation',
    '@protocol',
    '@class',
    '@public',
    '@protected',
    '@private',
    '@property',
    '@try',
    '@throw',
    '@catch',
    '@finally',
    '@synthesize',
    '@dynamic',
    '@selector',
    'atomic',
    'nonatomic',
    'retain',
    '_cmd',
    '__autoreleasing',
    '__strong',
    '__weak',
    '__unsafe_unretained',
  ],

  isValidIOSTypeName(iosTypeName: string): boolean {
    return /^[a-zA-Z_]+([a-zA-Z_0-9])*$/.test(iosTypeName);
  },
};

/** PropertyNameAllocator.forObjC(): the keywords are taken. */
export function propertyNameAllocatorForObjC(): PropertyNameAllocator {
  const allocator = new PropertyNameAllocator();
  for (const keyword of ObjCValidation.objcKeywords) allocator.allocate(keyword);
  return allocator;
}
