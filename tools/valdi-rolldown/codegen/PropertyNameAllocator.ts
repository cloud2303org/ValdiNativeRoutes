// ViewModels/PropertyNameAllocator.swift: generated identifiers that don't conflict with each other (a second `x`
// becomes `x2`), in scopes that also avoid their parent's names.

export class PropertyName {
  constructor(
    readonly originalName: string,
    readonly id = 0,
  ) {}

  get name(): string {
    return this.id === 0 ? this.originalName : `${this.originalName}${this.id + 1}`;
  }

  toString(): string {
    return this.name;
  }
}

export class PropertyNameAllocator {
  private parent?: PropertyNameAllocator;
  private propertyNames = new Map<string, Set<number>>();

  allocate(property: string): PropertyName {
    const propertyName = this.resolve(property);
    const ids = this.propertyNames.get(propertyName.originalName) ?? new Set<number>();
    ids.add(propertyName.id);
    this.propertyNames.set(propertyName.originalName, ids);
    return propertyName;
  }

  private resolve(property: string): PropertyName {
    // If we have a parent, the property should not conflict with anything it has.
    let firstId = this.parent ? this.parent.resolve(property).id : 0;
    const existingIds = this.propertyNames.get(property) ?? new Set<number>();
    while (existingIds.has(firstId)) firstId += 1;
    return new PropertyName(property, firstId);
  }

  /** A new allocator with its own scope, whose names don't conflict with this one's either. */
  scoped(): PropertyNameAllocator {
    const nameAllocator = new PropertyNameAllocator();
    nameAllocator.parent = this;
    return nameAllocator;
  }
}
