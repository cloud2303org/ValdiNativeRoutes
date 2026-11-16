import { getNFCAdapter, type NFCAdapter } from './adapter';

export interface NFCExtension {
  getNFCAdapter(): NFCAdapter;
}

/** Lives as long as the app, on the one native NFC session. */
export const createNFCExtension = (): NFCExtension => {
  const adapter = getNFCAdapter();
  return { getNFCAdapter: () => adapter };
};
