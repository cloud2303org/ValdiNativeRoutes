import { isAndroid } from '../permissions/index';
import { mapNFCError, nfcError, WECHAT_NFC_ERROR_CODES } from './errors';
import { nativeNFC } from './native';
import * as schema from './schemas';
import type { NativeNFCTag, NFCRecord, NFCTechHandle, NFCTechnologyName } from './types';

export type NFCResult<T extends object = object> = {
  errMsg: string;
  errCode: 0;
} & T;

export interface NFCDiscoveredEvent {
  id: ArrayBuffer;
  techs: string[];
  messages: NFCRecord[];
}

export interface NdefMessageEvent {
  id: ArrayBuffer;
  messages: NFCRecord[];
}

export type NFCDiscoveredCallback = (event: NFCDiscoveredEvent) => void;
export type NdefMessageCallback = (event: NdefMessageEvent) => void;

export interface NFCTechnology {
  connect(): Promise<NFCResult>;
  close(): Promise<NFCResult>;
  /** Deprecated by WeChat; succeeds only while this technology is connected. */
  isConnected(): Promise<NFCResult>;
  transceive(options: { data: ArrayBuffer }): Promise<NFCResult<{ data: ArrayBuffer }>>;
  getMaxTransceiveLength(): Promise<NFCResult<{ length: number }>>;
  setTimeout(options: { timeout: number }): Promise<NFCResult>;
}

export interface NfcA extends NFCTechnology {
  getAtqa(): Promise<NFCResult<{ atqa: ArrayBuffer }>>;
  getSak(): Promise<NFCResult<{ sak: number }>>;
}
export interface IsoDep extends NFCTechnology {
  getHistoricalBytes(): Promise<NFCResult<{ histBytes: ArrayBuffer }>>;
}
export type NfcB = NFCTechnology;
export type NfcF = NFCTechnology;
export type NfcV = NFCTechnology;
export type MifareClassic = NFCTechnology;
export type MifareUltralight = NFCTechnology;

export interface NdefRecordInput {
  id: ArrayBuffer;
  type: ArrayBuffer;
  payload: ArrayBuffer;
  /** Defaults to TNF_WELL_KNOWN (1); include this field for byte-faithful record round trips. */
  tnf?: number;
}

export interface WriteNdefMessageOptions {
  uris?: string[];
  texts?: string[];
  records?: NdefRecordInput[];
}

export interface Ndef {
  connect(): Promise<NFCResult>;
  close(): Promise<NFCResult>;
  isConnected(): Promise<NFCResult>;
  setTimeout(options: { timeout: number }): Promise<NFCResult>;
  writeNdefMessage(options: WriteNdefMessageOptions): Promise<NFCResult>;
  onNdefMessage(callback: NdefMessageCallback): void;
  offNdefMessage(callback?: NdefMessageCallback): void;
}

export const NFC_TECH = Object.freeze({
  nfcA: 'android.nfc.tech.NfcA',
  nfcB: 'android.nfc.tech.NfcB',
  nfcF: 'android.nfc.tech.NfcF',
  nfcV: 'android.nfc.tech.NfcV',
  isoDep: 'android.nfc.tech.IsoDep',
  mifareClassic: 'android.nfc.tech.MifareClassic',
  mifareUltralight: 'android.nfc.tech.MifareUltralight',
  ndef: 'android.nfc.tech.Ndef',
});

export interface NFCAdapter {
  readonly tech: typeof NFC_TECH;
  startDiscovery(): Promise<NFCResult>;
  stopDiscovery(): Promise<NFCResult>;
  onDiscovered(callback: NFCDiscoveredCallback): void;
  offDiscovered(callback?: NFCDiscoveredCallback): void;
  getNfcA(): NfcA;
  getNfcB(): NfcB;
  getNfcF(): NfcF;
  getNfcV(): NfcV;
  getIsoDep(): IsoDep;
  getMifareClassic(): MifareClassic;
  getMifareUltralight(): MifareUltralight;
  getNdef(): Ndef;
}

const invoke = <T>(listener: (value: T) => void, value: T): void => {
  try {
    listener(value);
  } catch (error) {
    console.error('[nfc] listener failed', error);
  }
};

const copyRecord = (record: NFCRecord): NFCRecord => ({
  id: record.id.slice(0),
  type: record.type.slice(0),
  payload: record.payload.slice(0),
  tnf: record.tnf,
});

/** Adds `operation:ok` and errCode 0, or turns a failure into the mini-program error. */
async function withErrMsg<T extends object>(operation: string, execute: () => Promise<T>): Promise<NFCResult<T>> {
  try {
    return { ...(await execute()), errMsg: `${operation}:ok`, errCode: 0 };
  } catch (original) {
    throw mapNFCError(operation, original);
  }
}

class AdapterRuntime {
  private readonly native = nativeNFC;
  private discovering = false;
  private starting = false;
  private tag: NativeNFCTag | undefined;
  private discoveredSubscription: number | undefined;
  private stateSubscription: number | undefined;
  private readonly discovered = new Set<NFCDiscoveredCallback>();
  private readonly ndefListeners = new Set<NdefMessageCallback>();

  private checkOperation(): void {
    if (!isAndroid()) {
      throw nfcError(WECHAT_NFC_ERROR_CODES.NOT_SUPPORTED, 'NFC is Android-only');
    }
  }

  private ensureEvents(): void {
    if (this.discoveredSubscription === undefined) {
      this.discoveredSubscription = this.native.onDiscovered(event => {
        if (!this.discovering) return;
        this.tag = {
          tagHandle: event.tagHandle,
          id: event.id.slice(0),
          techs: [...event.techs],
          messages: event.messages.map(copyRecord),
        };
        for (const listener of [...this.discovered]) {
          if (!this.discovering || this.tag?.tagHandle !== event.tagHandle) break;
          invoke(listener, {
            id: event.id.slice(0),
            techs: [...event.techs],
            messages: event.messages.map(copyRecord),
          });
        }
        if (event.techs.includes(NFC_TECH.ndef)) {
          for (const listener of [...this.ndefListeners]) {
            if (!this.discovering || this.tag?.tagHandle !== event.tagHandle) break;
            invoke(listener, { id: event.id.slice(0), messages: event.messages.map(copyRecord) });
          }
        }
      });
    }
    if (this.stateSubscription === undefined) {
      this.stateSubscription = this.native.onDiscoveryStateChange(state => {
        this.discovering = state.discovering;
        if (!state.discovering) this.tag = undefined;
      });
    }
  }

  startDiscovery(): Promise<NFCResult> {
    return withErrMsg('NFCAdapter.startDiscovery', async () => {
      this.checkOperation();
      if (this.starting || this.discovering) {
        throw nfcError(WECHAT_NFC_ERROR_CODES.DISCOVERY_ALREADY_STARTED, 'Reader already started');
      }
      this.ensureEvents();
      this.starting = true;
      this.discovering = true;
      try {
        await this.native.startDiscovery();
      } catch (error) {
        this.discovering = false;
        this.tag = undefined;
        throw error;
      } finally {
        this.starting = false;
      }
      return {};
    });
  }

  stopDiscovery(): Promise<NFCResult> {
    return withErrMsg('NFCAdapter.stopDiscovery', async () => {
      this.checkOperation();
      this.discovering = false;
      this.tag = undefined;
      await this.native.stopDiscovery();
      return {};
    });
  }

  onDiscovered(listener: NFCDiscoveredCallback): void {
    schema.parseOptions(schema.listener, listener);
    this.discovered.add(listener);
  }
  offDiscovered(listener?: NFCDiscoveredCallback): void {
    if (listener !== undefined) {
      schema.parseOptions(schema.listener, listener);
      this.discovered.delete(listener);
    } else this.discovered.clear();
  }

  technology(name: NFCTechnologyName): NfcA | IsoDep | NFCTechnology | Ndef {
    let tagHandle = this.tag?.tagHandle;
    const handle = (): NFCTechHandle => {
      tagHandle ??= this.tag?.tagHandle;
      if (!tagHandle || tagHandle !== this.tag?.tagHandle || !this.discovering) {
        throw nfcError(WECHAT_NFC_ERROR_CODES.TAG_NOT_DISCOVERED, 'Tag handle is missing or stale');
      }
      return { tagHandle, tech: name };
    };
    const run = <T extends object>(
      operation: string,
      action: (target: NFCTechHandle) => Promise<T>,
    ): Promise<NFCResult<T>> =>
      withErrMsg(`${name}.${operation}`, async () => {
        this.checkOperation();
        const target = handle();
        const result = await action(target);
        handle();
        return result;
      });
    const common = {
      connect: () =>
        run('connect', async target => {
          await this.native.connect(target);
          return {};
        }),
      close: () =>
        run('close', async target => {
          await this.native.close(target);
          return {};
        }),
      isConnected: () =>
        run('isConnected', async target => {
          if (!(await this.native.isConnected(target)))
            throw nfcError(WECHAT_NFC_ERROR_CODES.TECH_NOT_CONNECTED, 'Technology is not connected');
          return {};
        }),
      setTimeout: (options: { timeout: number }) =>
        run('setTimeout', async target => {
          const { timeout } = schema.parseOptions(schema.setTimeoutOptions, options);
          await this.native.setTimeout(target, timeout);
          return {};
        }),
    };
    if (name === 'Ndef') {
      return {
        ...common,
        writeNdefMessage: (options: WriteNdefMessageOptions) =>
          run('writeNdefMessage', async target => {
            const { records, uris, texts } = schema.parseOptions(schema.writeNdefMessageOptions, options);
            await this.native.writeNdefMessage(target, records, uris, texts);
            return {};
          }),
        onNdefMessage: (listener: NdefMessageCallback) => {
          schema.parseOptions(schema.listener, listener);
          this.ndefListeners.add(listener);
        },
        offNdefMessage: (listener?: NdefMessageCallback) => {
          if (listener !== undefined) {
            schema.parseOptions(schema.listener, listener);
            this.ndefListeners.delete(listener);
          } else this.ndefListeners.clear();
        },
      };
    }
    const raw: NFCTechnology = {
      ...common,
      transceive: options =>
        run('transceive', async target => {
          const { data } = schema.parseOptions(schema.transceiveOptions, options);
          return { data: await this.native.transceive(target, data) };
        }),
      getMaxTransceiveLength: () =>
        run('getMaxTransceiveLength', async target => ({ length: await this.native.getMaxTransceiveLength(target) })),
    };
    if (name === 'NfcA')
      return {
        ...raw,
        getAtqa: () => run('getAtqa', async target => ({ atqa: await this.native.getAtqa(target) })),
        getSak: () => run('getSak', async target => ({ sak: await this.native.getSak(target) })),
      } as NfcA;
    if (name === 'IsoDep')
      return {
        ...raw,
        getHistoricalBytes: () =>
          run('getHistoricalBytes', async target => ({ histBytes: await this.native.getHistoricalBytes(target) })),
      } as IsoDep;
    return raw;
  }
}

/** Lives as long as the app; creating it has no native side effects. */
export const createNFCAdapter = (): NFCAdapter => {
  const runtime = new AdapterRuntime();
  return {
    tech: NFC_TECH,
    startDiscovery: runtime.startDiscovery.bind(runtime),
    stopDiscovery: runtime.stopDiscovery.bind(runtime),
    onDiscovered: runtime.onDiscovered.bind(runtime),
    offDiscovered: runtime.offDiscovered.bind(runtime),
    getNfcA: () => runtime.technology('NfcA') as NfcA,
    getNfcB: () => runtime.technology('NfcB') as NfcB,
    getNfcF: () => runtime.technology('NfcF') as NfcF,
    getNfcV: () => runtime.technology('NfcV') as NfcV,
    getIsoDep: () => runtime.technology('IsoDep') as IsoDep,
    getMifareClassic: () => runtime.technology('MifareClassic') as MifareClassic,
    getMifareUltralight: () => runtime.technology('MifareUltralight') as MifareUltralight,
    getNdef: () => runtime.technology('Ndef') as Ndef,
  };
};

let defaultAdapter: NFCAdapter | undefined;
export const getNFCAdapter = (): NFCAdapter => (defaultAdapter ??= createNFCAdapter());
