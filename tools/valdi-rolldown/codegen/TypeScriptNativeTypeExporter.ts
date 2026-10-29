// TypeScript/TypeScriptNativeTypeExporter.swift: a dumped interface, class, enum, function or module as the Valdi
// model the generators write, its TypeScript types mapped to Valdi's (references to other exported types through the
// resolver). Synchronous here: Swift's Promises only carried errors.
import type { AST, DumpedRootNode } from '../vendor/companion/AST';
import {
  EMPTY_INJECTABLE_PARAMS,
  isOptional,
  unwrappingOptional,
  UNTYPED_MAP,
  type EnumCase,
  type ExportedFunction,
  type ExportedModule,
  type ExportedType,
  type CppType,
  type InjectableParams,
  type IOSType,
  type OmitConstructorParams,
  type ValdiModel,
  type ValdiModelProperty,
  type ValdiModelPropertyType,
  type ValdiNodeClassMapping,
} from './Models';
import {
  documentError,
  parseAnnotationType,
  TypeScriptAnnotatedSymbol,
  ValdiAnnotationType,
  ValdiTypeScriptAnnotation,
  type TypeScriptCommentedFile,
} from './TypeScriptAnnotation';
import type { TypeScriptNativeTypeResolver } from './TypeScriptNativeTypeResolver';
import { CompilerError, nonEmpty, removingSuffixes, TYPESCRIPT_FILE_EXTENSIONS_DOTTED } from './Utils';

/** GeneratedTypesDiagnostics.swift's nativeApiDeclaredVersion: the @Version payload. */
export const nativeApiDeclaredVersion = (annotations: ValdiTypeScriptAnnotation[]) =>
  annotations.find(annotation => annotation.name === ValdiAnnotationType.version)?.positionalPayload;

interface EnumMember {
  name: string;
  value: { kind: 'string'; value: string } | { kind: 'number'; value: number };
  comments?: string;
  declaredVersion?: string;
}

/** EnumMemberSequence: the values of the members without one, from 0 or after the last number. */
class EnumMemberSequence {
  private sequence = 0;

  setNext(next: number): void {
    this.sequence = next;
  }

  assign(): number {
    return this.sequence++;
  }
}

interface PropertyMetadata {
  comments?: string;
  omitConstructor?: OmitConstructorParams;
  injectableParams: InjectableParams;
  shouldCallOnWorkerThread: boolean;
}

export class TypeScriptNativeTypeExporter {
  constructor(
    private readonly iosType: IOSType | undefined,
    private readonly androidClass: string | undefined,
    private readonly commentedFile: TypeScriptCommentedFile,
    private readonly annotatedSymbol: TypeScriptAnnotatedSymbol,
    private readonly dumpedSymbol: DumpedRootNode,
    private readonly nativeTypeResolver: TypeScriptNativeTypeResolver,
    private readonly cppType?: CppType,
  ) {}

  private throwAnnotationError(comments: AST.Comments, message: string): never {
    throw documentError(
      message,
      comments.start,
      this.commentedFile.fileContent,
      this.commentedFile.src.compilationPath,
    );
  }

  private validateWorkerThreadAnnotation(
    functionReturnType: ValdiModelPropertyType,
    leadingComments: AST.Comments,
  ): void {
    if (functionReturnType.kind !== 'void' && functionReturnType.kind !== 'promise') {
      this.throwAnnotationError(
        leadingComments,
        '@WorkerThread can only be set on functions returning a Promise or void',
      );
    }
  }

  private makeUnrecognizedType(
    type: AST.Type,
    annotations: ValdiTypeScriptAnnotation[] | undefined,
    name: string,
  ): ValdiModelPropertyType {
    for (const annotation of annotations ?? []) {
      const annotationType = parseAnnotationType(annotation.name);
      if (annotationType === undefined) this.throwAnnotationError(type.leadingComments!, 'Invalid annotation');
      if (annotationType === ValdiAnnotationType.untypedMap) return UNTYPED_MAP;
      if (annotationType === ValdiAnnotationType.untyped) return { kind: 'any' };
    }
    throw new CompilerError(`Unrecognized type '${name}'. Only annotated types can be exported.`);
  }

  private resolveType(type: AST.Type, references: readonly AST.TypeReference[]): ValdiModelPropertyType {
    const annotations = type.leadingComments
      ? ValdiTypeScriptAnnotation.extractAnnotations(type.leadingComments, this.commentedFile.fileContent)
      : undefined;

    if (type.function) {
      const functionParameters = type.function.parameters.map(parameter =>
        this.parsePropertyOrParameter(parameter, references, undefined),
      );
      const returnValue = this.resolveType(type.function.returnValue, references);

      let isSingleCall = false;
      let shouldCallOnWorkerThread = false;
      let allowSyncCall = false;
      for (const annotation of annotations ?? []) {
        const annotationType = parseAnnotationType(annotation.name);
        if (annotationType === undefined) this.throwAnnotationError(type.leadingComments!, 'Invalid annotation');
        if (annotationType === ValdiAnnotationType.singleCall) {
          isSingleCall = true;
        } else if (annotationType === ValdiAnnotationType.workerThread) {
          this.validateWorkerThreadAnnotation(returnValue, type.leadingComments!);
          shouldCallOnWorkerThread = true;
        } else if (annotationType === ValdiAnnotationType.allowSyncCall) {
          allowSyncCall = true;
        } else if (annotationType === ValdiAnnotationType.version) {
          // Version annotations are validation metadata and do not affect native code generation.
        } else {
          this.throwAnnotationError(
            type.leadingComments!,
            'Function only support the @SingleCall, @WorkerThread and @AllowSyncCall annotations',
          );
        }
      }
      return {
        kind: 'function',
        parameters: functionParameters,
        returnType: returnValue,
        isSingleCall,
        shouldCallOnWorkerThread,
        allowSyncCall,
      };
    }

    if (type.typeReferenceIndex !== undefined) {
      const typeReferenceIndex = type.typeReferenceIndex;
      if (typeReferenceIndex < 0 || typeReferenceIndex >= references.length) {
        throw new CompilerError(`Out of bounds type reference ${typeReferenceIndex}`);
      }
      const typeReference = references[typeReferenceIndex];

      switch (typeReference.name) {
        case 'Uint8Array':
          return { kind: 'bytes' };
        case 'Long':
          return { kind: 'long' };
        case 'Number':
          return { kind: 'double' };
        case 'Promise':
        case 'CancelablePromise': {
          const typeArgument = type.typeArguments?.[0];
          if (!typeArgument) throw new CompilerError('Promise types should have a single type argument');
          return { kind: 'promise', typeArgument: this.resolveType(typeArgument.type, references) };
        }
        case 'Map':
          // TODO(simon): Real implementation
          return UNTYPED_MAP;
      }

      if (type.isTypeParameter === true) return { kind: 'genericTypeParameter', name: typeReference.name };

      const resolvedClass = this.nativeTypeResolver.resolve(typeReference.fileName, typeReference.name);
      if (!resolvedClass) return this.makeUnrecognizedType(type, annotations, typeReference.name);
      if (resolvedClass.marshallAsUntypedMap) return UNTYPED_MAP;

      const classMapping: ValdiNodeClassMapping = {
        tsType: typeReference.name,
        iosType: resolvedClass.iosType,
        androidClassName: resolvedClass.androidClass,
        cppType: resolvedClass.cppType,
        kind: resolvedClass.kind,
        isGenerated: resolvedClass.isGenerated,
        marshallAsUntyped: resolvedClass.marshallAsUntyped,
        converter: resolvedClass.convertedFromFunctionPath,
      };
      if (type.typeArguments) {
        if (resolvedClass.kind !== 'class') {
          throw new CompilerError('Generics are only supported on generated types annotated with @GenerateNativeClass');
        }
        const typeArguments = type.typeArguments.map(argument => this.resolveType(argument.type, references));
        return { kind: 'genericObject', mapping: classMapping, typeArguments };
      }
      return resolvedClass.kind === 'class' || resolvedClass.kind === 'interface'
        ? { kind: 'object', mapping: classMapping }
        : { kind: 'enum', mapping: classMapping };
    }

    if (type.array) return { kind: 'array', elementType: this.resolveType(type.array, references) };

    if (type.unions) {
      let resolvedType: ValdiModelPropertyType | undefined;
      let optional = false;
      const description = () => type.unions!.map(union => union.name).join(' | ');
      for (const union of type.unions) {
        if (union.name === 'null' || union.name === 'undefined') {
          optional = true;
        } else {
          if (resolvedType)
            throw new CompilerError(`Union types are only supported with null or undefined (got ${description()}`);
          resolvedType = this.resolveType(union, references);
        }
      }
      if (!resolvedType) throw new CompilerError(`Could not resolve type in union '${description()}'`);
      return optional ? { kind: 'nullable', type: resolvedType } : resolvedType;
    }

    switch (type.name) {
      case 'string':
        return { kind: 'string' };
      case 'number':
        return { kind: 'double' };
      case 'boolean':
        return { kind: 'bool' };
      case 'void':
        return { kind: 'void' };
      case 'any':
        // TODO: should actually be .any, but introduces lots of breaking changes
        return UNTYPED_MAP;
      case 'object':
        return { kind: 'any' };
      default:
        return this.makeUnrecognizedType(type, annotations, type.name);
    }
  }

  private getPropertyMetadata(leadingComments: AST.Comments): PropertyMetadata {
    const annotations = ValdiTypeScriptAnnotation.extractAnnotations(leadingComments, this.commentedFile.fileContent);

    let omitConstructor: OmitConstructorParams | undefined;
    const omitted = annotations.find(annotation => annotation.name === ValdiAnnotationType.constructorOmitted);
    if (omitted) {
      const flag = (value: string | undefined) => (value === undefined ? undefined : value === 'true');
      omitConstructor = { ios: flag(omitted.parameters?.ios), android: flag(omitted.parameters?.android) };
    }

    let injectableParams = EMPTY_INJECTABLE_PARAMS;
    const injectable = annotations.find(annotation => annotation.name === ValdiAnnotationType.injectable);
    if (injectable) {
      // No parameters mean it's injectable on both.
      if (!injectable.parameters || !Object.keys(injectable.parameters).length) {
        injectableParams = { ios: true, android: true };
      } else {
        const iosOnly = injectable.parameters.iosOnly === 'true';
        const androidOnly = injectable.parameters.androidOnly === 'true';
        if (iosOnly && androidOnly) {
          throw new CompilerError(
            'The @Injectable annotation should either be iosOnly or androidOnly. If you want it injectable on both platforms, remove any parameters.',
          );
        }
        injectableParams = { ios: iosOnly, android: androidOnly };
      }
    }

    const shouldCallOnWorkerThread = annotations.some(
      annotation => annotation.name === ValdiAnnotationType.workerThread,
    );
    const comments = TypeScriptAnnotatedSymbol.mergedCommentsWithoutAnnotations(leadingComments.text, annotations);
    return { comments: nonEmpty(comments), omitConstructor, injectableParams, shouldCallOnWorkerThread };
  }

  private parsePropertyLike(
    name: string,
    type: AST.Type,
    optional: boolean,
    leadingComments: AST.Comments | undefined,
    references: readonly AST.TypeReference[],
    declaredVersion: string | undefined,
  ): ValdiModelProperty {
    let parsedType = this.resolveType(type, references);
    if (optional) parsedType = { kind: 'nullable', type: parsedType };

    let metadata: PropertyMetadata | undefined;
    if (leadingComments) {
      metadata = this.getPropertyMetadata(leadingComments);
      if (metadata.omitConstructor && !isOptional(parsedType)) {
        throw new CompilerError('@ConstructorOmitted can only be set on an optional property or function');
      }
      if (metadata.injectableParams.android && metadata.injectableParams.ios && isOptional(parsedType)) {
        throw new CompilerError('@Injectable can only be set on non-optional properties');
      }
      if (metadata.shouldCallOnWorkerThread) {
        const unwrapped = unwrappingOptional(parsedType);
        if (unwrapped.kind !== 'function') {
          this.throwAnnotationError(leadingComments, '@WorkerThread can only be set on functions or methods');
        }
        this.validateWorkerThreadAnnotation(unwrapped.returnType, leadingComments);
        const newType: ValdiModelPropertyType = { ...unwrapped, shouldCallOnWorkerThread: true };
        parsedType = isOptional(parsedType) ? { kind: 'nullable', type: newType } : newType;
      }
    }

    return {
      name,
      type: parsedType,
      comments: metadata?.comments,
      omitConstructor: metadata?.omitConstructor,
      injectableParams: metadata?.injectableParams ?? EMPTY_INJECTABLE_PARAMS,
      declaredVersion,
    };
  }

  private parsePropertyOrParameter(
    declaration: AST.PropertyLikeDeclaration,
    references: readonly AST.TypeReference[],
    declaredVersion: string | undefined,
  ): ValdiModelProperty {
    return this.parsePropertyLike(
      declaration.name,
      declaration.type,
      declaration.isOptional,
      declaration.leadingComments,
      references,
      declaredVersion,
    );
  }

  export(): ExportedType {
    return this.dumpedSymbol.enum ? this.exportEnum() : { kind: 'valdiModel', model: this.exportValdiModel() };
  }

  private parseEnumMember(
    enumMember: AST.EnumMember,
    sequence: EnumMemberSequence,
    declaredVersion: string | undefined,
  ): EnumMember {
    const comments = enumMember.leadingComments?.text;
    if (enumMember.numberValue !== undefined) {
      // Swift's Int(String): an optional sign and decimal digits.
      if (!/^[+-]?[0-9]+$/.test(enumMember.numberValue)) {
        throw new CompilerError(
          `Could not parse number '${enumMember.numberValue}' in enum member ${enumMember.name} `,
        );
      }
      const enumValue = Number(enumMember.numberValue);
      sequence.setNext(enumValue + 1);
      return { name: enumMember.name, value: { kind: 'number', value: enumValue }, comments, declaredVersion };
    }
    if (enumMember.stringValue !== undefined) {
      return {
        name: enumMember.name,
        value: { kind: 'string', value: enumMember.stringValue },
        comments,
        declaredVersion,
      };
    }
    return { name: enumMember.name, value: { kind: 'number', value: sequence.assign() }, comments, declaredVersion };
  }

  exportFunction(): ExportedFunction {
    const dumpedFunction = this.dumpedSymbol.function;
    if (!dumpedFunction) throw new CompilerError(`Missing function data for '${this.dumpedSymbol.text}'`);
    const references = this.commentedFile.references;
    return {
      containingIosType: this.iosType,
      containingAndroidTypeName: this.androidClass,
      containingCppType: this.cppType,
      functionName: dumpedFunction.name,
      parameters: dumpedFunction.type.parameters.map(parameter =>
        this.parsePropertyOrParameter(parameter, references, undefined),
      ),
      returnType: this.resolveType(dumpedFunction.type.returnValue, references),
      allowSyncCall: this.annotatedSymbol.annotations.some(
        annotation => annotation.name === ValdiAnnotationType.allowSyncCall,
      ),
      comments: this.annotatedSymbol.mergedCommentsWithoutAnnotations(),
      declaredVersion: nativeApiDeclaredVersion(this.annotatedSymbol.annotations),
    };
  }

  /**
   * The file's exported functions and variables as an interface's members. A function's member takes the leading
   * comments of the module's symbol (the one @ExportModule is on), as the compiler does.
   */
  exportModule(): ExportedModule {
    const references = this.commentedFile.references;
    const properties: ValdiModelProperty[] = [];
    for (const exportedSymbol of this.commentedFile.annotatedSymbols) {
      if (!exportedSymbol.symbol.modifiers?.includes('export')) continue;
      const declaredVersion = nativeApiDeclaredVersion(exportedSymbol.annotations);
      const fn = exportedSymbol.symbol.function;
      if (fn) {
        const wrappedType: AST.Type = { name: fn.name, function: fn.type };
        properties.push(
          this.parsePropertyLike(
            fn.name,
            wrappedType,
            false,
            this.dumpedSymbol.leadingComments,
            references,
            declaredVersion,
          ),
        );
      }
      const variable = exportedSymbol.symbol.variable;
      if (variable) {
        properties.push(
          this.parsePropertyLike(
            variable.name,
            variable.type,
            false,
            variable.leadingComments,
            references,
            declaredVersion,
          ),
        );
      }
    }
    const model: ValdiModel = {
      tsType: this.dumpedSymbol.text,
      exportAsInterface: true,
      cppType: this.cppType,
      iosType: this.iosType,
      androidClassName: this.androidClass,
      declaredVersion: nativeApiDeclaredVersion(this.annotatedSymbol.annotations),
      isNativeApi: true,
      legacyConstructors: false,
      usePublicFields: false,
      properties,
    };
    const modulePath = removingSuffixes(this.commentedFile.src.compilationPath, TYPESCRIPT_FILE_EXTENSIONS_DOTTED);
    return { model, modulePath };
  }

  private exportEnum(): ExportedType {
    const dumpedEnum = this.dumpedSymbol.enum;
    if (!dumpedEnum) throw new CompilerError(`Missing enum data for '${this.dumpedSymbol.text}'`);

    const comments = this.annotatedSymbol.mergedCommentsWithoutAnnotations();
    const enumSequence = new EnumMemberSequence();
    const enumMembers = dumpedEnum.members.map((enumMember, index) =>
      this.parseEnumMember(
        enumMember,
        enumSequence,
        nativeApiDeclaredVersion(this.annotatedSymbol.memberAnnotations.get(index) ?? []),
      ),
    );
    const cleanComments = (member: EnumMember) =>
      member.comments === undefined ? undefined : TypeScriptAnnotatedSymbol.cleanCommentString(member.comments);
    const stringCases: EnumCase<string>[] = [];
    const numberCases: EnumCase<number>[] = [];
    for (const member of enumMembers) {
      const enumCase = { name: member.name, comments: cleanComments(member), declaredVersion: member.declaredVersion };
      if (member.value.kind === 'string') stringCases.push({ ...enumCase, value: member.value.value });
      else numberCases.push({ ...enumCase, value: member.value.value });
    }
    if (!stringCases.length === !numberCases.length) {
      throw new CompilerError(`Invalid enum members: ${JSON.stringify(enumMembers)}`);
    }

    return {
      kind: 'enum',
      exportedEnum: {
        iosType: this.iosType,
        androidTypeName: this.androidClass,
        cppType: this.cppType,
        cases: stringCases.length ? { kind: 'stringEnum', cases: stringCases } : { kind: 'enum', cases: numberCases },
        comments,
        declaredVersion: nativeApiDeclaredVersion(this.annotatedSymbol.annotations),
      },
    };
  }

  private exportValdiModel(): ValdiModel {
    const dumpedInterface = this.dumpedSymbol.interface;
    if (!dumpedInterface) throw new CompilerError(`Missing interface data for '${this.dumpedSymbol.text}'`);

    const comments = this.annotatedSymbol.mergedCommentsWithoutAnnotations();
    const properties = dumpedInterface.members.map((member, index) => {
      try {
        return this.parsePropertyOrParameter(
          member,
          this.commentedFile.references,
          nativeApiDeclaredVersion(this.annotatedSymbol.memberAnnotations.get(index) ?? []),
        );
      } catch (error) {
        throw new CompilerError(`Failed to parse property ${member.name}: ${(error as Error).message}`);
      }
    });

    const exportModelAnnotation = this.annotatedSymbol.annotations.find(
      annotation => annotation.name === ValdiAnnotationType.exportModel,
    );
    return {
      tsType: this.dumpedSymbol.text,
      iosType: this.iosType,
      androidClassName: this.androidClass,
      cppType: this.cppType,
      properties,
      comments,
      typeParameters: dumpedInterface.typeParameters?.map(parameter => ({ name: parameter.name })),
      declaredVersion: nativeApiDeclaredVersion(this.annotatedSymbol.annotations),
      isNativeApi: true,
      exportAsInterface: false,
      legacyConstructors: false,
      usePublicFields: exportModelAnnotation?.parameters?.usePublicFields === 'true',
    };
  }
}
