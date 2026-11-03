import { common, bundleManager } from '@kit.AbilityKit';
import { tag, nfcController } from '@kit.ConnectivityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { HarmonyPermissionService } from './HarmonyPermissionService';
import {
  NfcHost, NfcHostEvents, NfcAvailabilityModel, NfcHandleModel, NfcRecordModel, NfcTagModel
} from './PlatformServiceTypes';

function nfcError(code: number, detail: string): Error {
  return new Error(`E_NFC_${code}:${detail}`);
}

function mapError(error: Error, fallback: number = 13017): Error {
  if (error.message.startsWith('E_NFC_')) return error;
  switch ((error as BusinessError).code) {
    case 201: return nfcError(13019, 'NFC_TAG permission denied');
    case 801: return nfcError(fallback === 13000 ? 13000 : 13024, 'NFC capability or operation not supported');
    case 401: return nfcError(13011, 'invalid NFC argument');
    default: return nfcError(fallback, 'NFC operation failed');
  }
}

function techName(technology: number): string {
  switch (technology) {
    case tag.NFC_A: return 'NfcA';
    case tag.NFC_B: return 'NfcB';
    case tag.NFC_F: return 'NfcF';
    case tag.NFC_V: return 'NfcV';
    case tag.ISO_DEP: return 'IsoDep';
    case tag.NDEF: return 'Ndef';
    case tag.MIFARE_CLASSIC: return 'MifareClassic';
    case tag.MIFARE_ULTRALIGHT: return 'MifareUltralight';
    case tag.NDEF_FORMATABLE: return 'NdefFormatable';
    default: return '';
  }
}

function normalizedTech(name: string): string {
  const prefix = 'android.nfc.tech.';
  return name.startsWith(prefix) ? name.substring(prefix.length) : name;
}

function recordsFromSdk(records: tag.NdefRecord[]): NfcRecordModel[] {
  return records.map((record: tag.NdefRecord): NfcRecordModel => ({
    id: new Uint8Array(record.id), type: new Uint8Array(record.rtdType),
    payload: new Uint8Array(record.payload), tnf: record.tnf
  }));
}

class NfcTagEntry {
  sessions: Map<string, tag.TagSession> = new Map<string, tag.TagSession>();
  connectedTech: string = '';
  busy: boolean = false;
  operationEpoch: number = 0;
  pending: Set<(error: Error) => void> = new Set<(error: Error) => void>();
  readonly info: tag.TagInfo;
  readonly generation: number;
  constructor(info: tag.TagInfo, generation: number) {
    this.info = info;
    this.generation = generation;
  }
}

export class HarmonyNfcService implements NfcHost {
  private events?: NfcHostEvents;
  private active: boolean = false;
  private closed: boolean = false;
  private discovering: boolean = false;
  private generation: number = 0;
  private serial: number = 0;
  private readonly handleNamespace: string = util.generateRandomUUID();
  private tags: Map<string, NfcTagEntry> = new Map<string, NfcTagEntry>();
  private readerCallback?: (error: BusinessError, info: tag.TagInfo) => void;
  private stateCallback?: (state: nfcController.NfcState) => void;
  private readonly element: bundleManager.ElementName;
  private readonly context: common.UIAbilityContext;
  private readonly permissions: HarmonyPermissionService;

  constructor(context: common.UIAbilityContext, permissions: HarmonyPermissionService) {
    this.context = context;
    this.permissions = permissions;
    this.element = {
      bundleName: context.applicationInfo.name,
      abilityName: context.abilityInfo.name,
      moduleName: context.abilityInfo.moduleName
    };
  }

  setEvents(events: NfcHostEvents): void {
    if (!this.closed) this.events = events;
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('E_NFC_SESSION_RELEASED:host closed');
  }

  async getAvailability(): Promise<NfcAvailabilityModel> {
    this.ensureOpen();
    try {
      const supported = nfcController.isNfcSupported();
      const enabled = supported && nfcController.getNfcState() === nfcController.NfcState.STATE_ON;
      let granted: boolean = false;
      try { granted = await this.permissions.check('ohos.permission.NFC_TAG'); } catch (_) {}
      this.ensureOpen();
      return { supported, enabled, foreground: this.active, permissionGranted: granted };
    } catch (error) { throw mapError(error as Error, 13000); }
  }

  async startDiscovery(): Promise<void> {
    this.ensureOpen();
    if (this.discovering) throw nfcError(13021, 'discovery already started');
    const expected = this.generation;
    const availability = await this.getAvailability();
    this.ensureOpen();
    if (!availability.supported) throw nfcError(13000, 'NFC hardware unavailable');
    if (!availability.enabled) throw nfcError(13001, 'NFC switch off');
    if (!availability.permissionGranted) throw nfcError(13019, 'declare NFC_TAG normal system_grant permission');
    if (!this.active) throw nfcError(13019, 'reader mode requires foreground ability');
    if (this.discovering) throw nfcError(13021, 'discovery already started');
    if (expected !== this.generation) throw nfcError(13018, 'discovery start cancelled');
    const generation = ++this.generation;
    const reader = (error: BusinessError, info: tag.TagInfo): void => {
      if (error || !this.discovering || !this.active || generation !== this.generation || this.closed) return;
      this.discovered(info, generation).catch(() => {});
    };
    const state = (value: nfcController.NfcState): void => {
      if (generation !== this.generation || this.closed) return;
      if (value !== nfcController.NfcState.STATE_ON) this.stopReader();
    };
    try {
      nfcController.on('nfcStateChange', state);
      this.stateCallback = state;
      tag.on('readerMode', this.element,
        [tag.NFC_A, tag.NFC_B, tag.NFC_F, tag.NFC_V, tag.ISO_DEP, tag.NDEF,
          tag.MIFARE_CLASSIC, tag.MIFARE_ULTRALIGHT, tag.NDEF_FORMATABLE], reader);
      this.readerCallback = reader;
      this.discovering = true;
      this.events?.discoveryStateChange(true);
    } catch (error) {
      this.stopReader();
      throw mapError(error as Error, 13000);
    }
  }

  private async discovered(info: tag.TagInfo, generation: number): Promise<void> {
    // Each tag notification invalidates the previous TagInfo and all of its handles.
    this.releaseTags();
    const key = `harmony-nfc-${this.handleNamespace}-${generation}-${++this.serial}`;
    const entry = new NfcTagEntry(info, generation);
    this.tags.set(key, entry);
    let messages: NfcRecordModel[] = [];
    if (info.technology.includes(tag.NDEF)) {
      let ndef: tag.NdefTag | undefined = undefined;
      try {
        ndef = tag.getNdef(info);
        entry.sessions.set('Ndef', ndef);
        ndef.connect();
        messages = recordsFromSdk((await ndef.readNdef()).getNdefRecords());
      } catch (_) {
        // A tag can be unformatted or leave the field. Never fabricate an NDEF message.
      } finally {
        try { ndef?.resetConnection(); } catch (_) {}
      }
    }
    if (!this.discovering || !this.active || this.closed || generation !== this.generation ||
      this.tags.get(key) !== entry) return;
    const techs: string[] = [];
    info.technology.forEach((technology: number) => {
      const name = techName(technology);
      if (name) techs.push(`android.nfc.tech.${name}`);
    });
    const event: NfcTagModel = { tagHandle: key, id: new Uint8Array(info.uid), techs, messages };
    this.events?.discovered(event);
  }

  async stopDiscovery(): Promise<void> {
    this.ensureOpen();
    this.stopReader();
  }

  private stopReader(): void {
    const wasDiscovering = this.discovering;
    this.discovering = false;
    ++this.generation;
    if (this.readerCallback !== undefined) {
      try { tag.off('readerMode', this.element, this.readerCallback); } catch (_) {}
      this.readerCallback = undefined;
    }
    if (this.stateCallback !== undefined) {
      try { nfcController.off('nfcStateChange', this.stateCallback); } catch (_) {}
      this.stateCallback = undefined;
    }
    this.releaseTags();
    if (wasDiscovering) this.events?.discoveryStateChange(false);
  }

  private releaseTags(): void {
    this.tags.forEach((entry: NfcTagEntry) => {
      entry.pending.forEach((reject: (error: Error) => void) => reject(nfcError(13013, 'tag handle invalidated')));
      entry.pending.clear();
      entry.sessions.forEach((session: tag.TagSession) => {
        try { session.resetConnection(); } catch (_) {}
      });
    });
    this.tags.clear();
  }

  private entry(handle: NfcHandleModel): NfcTagEntry {
    this.ensureOpen();
    if (!this.discovering || !this.active) throw nfcError(13018, 'discovery not started');
    const entry = this.tags.get(handle.tagHandle);
    if (entry === undefined || entry.generation !== this.generation) throw nfcError(13013, 'tag not discovered or expired');
    const name = normalizedTech(handle.tech);
    const known = ['NfcA', 'NfcB', 'NfcF', 'NfcV', 'IsoDep', 'Ndef', 'MifareClassic', 'MifareUltralight', 'NdefFormatable'];
    if (!known.includes(name)) throw nfcError(13014, 'invalid technology');
    if (!entry.info.technology.some((technology: number) => techName(technology) === name)) {
      throw nfcError(13015, 'technology unavailable on this tag');
    }
    return entry;
  }

  private session(entry: NfcTagEntry, tech: string): tag.TagSession {
    const name = normalizedTech(tech);
    const cached = entry.sessions.get(name);
    if (cached !== undefined) return cached;
    let session: tag.TagSession;
    switch (name) {
      case 'NfcA': session = tag.getNfcA(entry.info); break;
      case 'NfcB': session = tag.getNfcB(entry.info); break;
      case 'NfcF': session = tag.getNfcF(entry.info); break;
      case 'NfcV': session = tag.getNfcV(entry.info); break;
      case 'IsoDep': session = tag.getIsoDep(entry.info); break;
      case 'Ndef': session = tag.getNdef(entry.info); break;
      case 'MifareClassic': session = tag.getMifareClassic(entry.info); break;
      case 'MifareUltralight': session = tag.getMifareUltralight(entry.info); break;
      case 'NdefFormatable': session = tag.getNdefFormatable(entry.info); break;
      default: throw nfcError(13014, 'invalid technology');
    }
    entry.sessions.set(name, session);
    return session;
  }

  private connected(handle: NfcHandleModel): tag.TagSession {
    const entry = this.entry(handle);
    const session = this.session(entry, handle.tech);
    if (entry.connectedTech !== normalizedTech(handle.tech) || !session.isConnected()) {
      throw nfcError(13023, 'technology not connected');
    }
    return session;
  }

  async connect(handle: NfcHandleModel): Promise<void> {
    try {
      const entry = this.entry(handle);
      if (entry.busy || entry.connectedTech) throw nfcError(13022, 'a technology is already connected');
      const session = this.session(entry, handle.tech);
      session.connect();
      if (!session.isConnected()) throw nfcError(13016, 'tag connection failed');
      entry.connectedTech = normalizedTech(handle.tech);
    } catch (error) { throw mapError(error as Error, 13016); }
  }

  async close(handle: NfcHandleModel): Promise<void> {
    try {
      const entry = this.entry(handle);
      if (entry.connectedTech !== normalizedTech(handle.tech)) throw nfcError(13023, 'technology not connected');
      ++entry.operationEpoch;
      entry.pending.forEach((reject: (error: Error) => void) => reject(nfcError(13023, 'technology closed')));
      entry.pending.clear();
      entry.busy = false;
      const session = this.session(entry, handle.tech);
      session.resetConnection();
      entry.connectedTech = '';
    } catch (error) { throw mapError(error as Error); }
  }

  async isConnected(handle: NfcHandleModel): Promise<boolean> {
    try {
      const entry = this.entry(handle);
      return entry.connectedTech === normalizedTech(handle.tech) && this.session(entry, handle.tech).isConnected();
    } catch (error) { throw mapError(error as Error); }
  }

  private operation<T>(handle: NfcHandleModel, action: () => Promise<T>): Promise<T> {
    const entry = this.entry(handle);
    if (entry.busy) return Promise.reject(nfcError(13017, 'tag I/O already pending'));
    entry.busy = true;
    const epoch = entry.operationEpoch;
    return new Promise<T>((resolve, reject) => {
      entry.pending.add(reject);
      Promise.resolve().then((): Promise<T> => {
        if (entry.operationEpoch !== epoch || this.tags.get(handle.tagHandle) !== entry || !this.discovering) {
          throw nfcError(13013, 'tag operation invalidated before dispatch');
        }
        return action();
      }).then((result: T) => {
        entry.pending.delete(reject);
        if (epoch !== entry.operationEpoch) { reject(nfcError(13023, 'technology closed')); return; }
        entry.busy = false;
        if (this.tags.get(handle.tagHandle) !== entry || !this.discovering) {
          reject(nfcError(13013, 'tag handle expired'));
        } else resolve(result);
      }, (error: Error) => {
        entry.pending.delete(reject);
        if (epoch === entry.operationEpoch) entry.busy = false;
        reject(mapError(error));
      });
    });
  }

  async transceive(handle: NfcHandleModel, data: Uint8Array): Promise<Uint8Array> {
    try {
      const session = this.connected(handle);
      const tech = normalizedTech(handle.tech);
      if (tech === 'Ndef' || tech === 'NdefFormatable') throw nfcError(13024, 'technology does not support raw transceive');
      if (data.byteLength === 0 || data.byteLength > session.getMaxTransmitSize()) {
        throw nfcError(13011, 'transceive data exceeds tag size or is empty');
      }
      const bytes: number[] = Array.from(data);
      return await this.operation(handle, async (): Promise<Uint8Array> => new Uint8Array(await session.transmit(bytes)));
    } catch (error) { throw mapError(error as Error); }
  }

  async getMaxTransceiveLength(handle: NfcHandleModel): Promise<number> {
    try { return this.connected(handle).getMaxTransmitSize(); }
    catch (error) { throw mapError(error as Error); }
  }

  async setTimeout(handle: NfcHandleModel, timeout: number): Promise<void> {
    try {
      if (!Number.isInteger(timeout) || timeout <= 0) throw nfcError(13011, 'timeout must be a positive integer');
      this.connected(handle).setTimeout(timeout);
    } catch (error) { throw mapError(error as Error); }
  }

  async getAtqa(handle: NfcHandleModel): Promise<Uint8Array> {
    try {
      const entry = this.entry(handle);
      this.connected(handle);
      if (normalizedTech(handle.tech) !== 'NfcA') throw nfcError(13024, 'ATQA requires NfcA');
      return new Uint8Array(tag.getNfcA(entry.info).getAtqa());
    } catch (error) { throw mapError(error as Error); }
  }

  async getSak(handle: NfcHandleModel): Promise<number> {
    try {
      const entry = this.entry(handle);
      this.connected(handle);
      if (normalizedTech(handle.tech) !== 'NfcA') throw nfcError(13024, 'SAK requires NfcA');
      return tag.getNfcA(entry.info).getSak();
    } catch (error) { throw mapError(error as Error); }
  }

  async getHistoricalBytes(handle: NfcHandleModel): Promise<Uint8Array> {
    try {
      const entry = this.entry(handle);
      this.connected(handle);
      if (normalizedTech(handle.tech) !== 'IsoDep') throw nfcError(13024, 'historical bytes require IsoDep');
      return new Uint8Array(tag.getIsoDep(entry.info).getHistoricalBytes());
    } catch (error) { throw mapError(error as Error); }
  }

  async writeNdefMessage(handle: NfcHandleModel, records: NfcRecordModel[], uris: string[], texts: string[]): Promise<void> {
    try {
      const entry = this.entry(handle);
      this.connected(handle);
      if (normalizedTech(handle.tech) !== 'Ndef') throw nfcError(13024, 'NDEF writes require Ndef technology');
      const ndef = this.session(entry, handle.tech) as tag.NdefTag;
      if (!ndef.isNdefWritable()) throw nfcError(13024, 'NDEF tag is read only');
      const sdkRecords: tag.NdefRecord[] = [];
      records.forEach((record: NfcRecordModel) => {
        if (!Number.isInteger(record.tnf) || record.tnf < 0 || record.tnf > 7) throw nfcError(13011, 'invalid TNF');
        sdkRecords.push({
          id: Array.from(record.id), rtdType: Array.from(record.type),
          payload: Array.from(record.payload), tnf: record.tnf
        });
      });
      uris.forEach((uri: string) => sdkRecords.push(tag.ndef.makeUriRecord(uri)));
      texts.forEach((text: string) => sdkRecords.push(tag.ndef.makeTextRecord(text, 'en')));
      if (sdkRecords.length === 0) throw nfcError(13011, 'NDEF message is empty');
      let message: tag.NdefMessage;
      try { message = tag.ndef.createNdefMessage(sdkRecords); }
      catch (_) { throw nfcError(13012, 'cannot encode NDEF records'); }
      await this.operation(handle, (): Promise<void> => ndef.writeNdef(message));
    } catch (error) { throw mapError(error as Error); }
  }

  setActive(active: boolean): void {
    if (this.closed) return;
    this.active = active;
    if (!active) this.stopReader();
  }

  dispose(): void {
    if (this.closed) return;
    this.active = false;
    this.stopReader();
    this.closed = true;
    this.events = undefined;
  }
}
