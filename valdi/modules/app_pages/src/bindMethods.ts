/** `names` of `target`, methods bound to it, so they can be spread into `api` and called detached. */
export function bindMethods<T extends object, K extends keyof T>(target: T, names: readonly K[]): Pick<T, K> {
  const methods = {} as Pick<T, K>;
  for (const name of names) {
    const value = target[name];
    methods[name] = typeof value === 'function' ? value.bind(target) : value;
  }
  return methods;
}
