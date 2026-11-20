declare module '@babel/core' {
  export function transformSync(
    code: string,
    options?: Record<string, any>,
  ): { code?: string | null; map?: any } | null;
}

declare module '@solidjs/babel-plugin' {
  const plugin: any;
  export default plugin;
}
