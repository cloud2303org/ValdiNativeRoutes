/**
 * Structural Drizzle-facing subset of client_sql/src/ClientSQLNative's connection,
 * transaction, callback and result contracts, including its required run/queryRows
 * extensions. These local types have no Valdi codegen annotations; keep them
 * aligned with the ClientSQL native declaration and implementation. The original
 * pinned API needs those extensions and a new runtime export before app use.
 * No JSON or Node Buffer crosses this boundary.
 */
export type NativeParameter = string | number | boolean | ArrayBuffer | null;
export type NativeCallback<T> = (value: T | undefined, error: string | undefined) => void;
export type NativeRunResult = { changes: number; lastInsertRowid: string };
export type NativeTransaction = {
  run(sql: string, params: NativeParameter[], callback: NativeCallback<NativeRunResult>): void;
  queryRows(sql: string, params: NativeParameter[], callback: NativeCallback<unknown[][]>): void;
  execute(sql: string, params: NativeParameter[] | undefined, callback: NativeCallback<void>): void;
};
export type NativeConnection = {
  run(sql: string, params: NativeParameter[], callback: NativeCallback<NativeRunResult>): void;
  queryRows(sql: string, params: NativeParameter[], callback: NativeCallback<unknown[][]>): void;
  transaction(
    body: (transaction: NativeTransaction, done: NativeCallback<void>) => void,
    callback: NativeCallback<void>,
  ): void;
  close(callback: NativeCallback<void>): void;
};
