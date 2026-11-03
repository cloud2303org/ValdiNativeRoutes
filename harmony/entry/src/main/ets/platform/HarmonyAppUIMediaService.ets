import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { camera, cameraPicker } from '@kit.CameraKit';
import { fileIo as fs, fileUri, picker } from '@kit.CoreFileKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { scanBarcode, scanCore } from '@kit.ScanKit';
import util from '@ohos.util';
import { uniformTypeDescriptor } from '@kit.ArkData';

export interface AppUIMediaScan { result: string; scanType: string; }
export interface AppUIMediaAsset { id: string; uri: string; name: string; mimeType: string; size: number; }
export interface AppUIMediaSelection { canceled: boolean; assets: AppUIMediaAsset[]; }

/**
 * SDK/cache resource fence only. No runtime, context, promise or delivery callback
 * is stored here. SDK26 has no cancellation API for these system presenters.
 * Keep a reservation until actual SDK settlement AND file cleanup, even if its
 * runtime closed. Never release on a timeout or merely because the API rejected.
 */
class MediaFence {
  private static occupied: Set<string> = new Set<string>();
  static enter(scope: string): void {
    if (MediaFence.occupied.has(scope)) throw new Error('E_APP_UI_MEDIA_BUSY:SDK presentation or cache work pending');
    MediaFence.occupied.add(scope);
  }
  static leave(scope: string): void { MediaFence.occupied.delete(scope); }
}

/** Logical API delivery can retire while the physical SDK operation remains. */
class MediaDelivery<T> {
  private resolve?: (value: T) => void;
  private reject?: (error: Error) => void;
  private resume?: () => void;
  retired: boolean = false;
  constructor(resolve: (value: T) => void, reject: (error: Error) => void) {
    this.resolve = resolve; this.reject = reject;
  }
  finish(value: T): void {
    const resolve = this.resolve;
    this.clear();
    resolve?.(value);
  }
  fail(error: Error): void {
    const reject = this.reject;
    this.retired = true;
    this.clear();
    reject?.(error);
  }
  private clear(): void {
    this.resolve = undefined; this.reject = undefined;
    const resume = this.resume; this.resume = undefined; resume?.();
  }
  check(): void {
    if (this.retired) throw new Error('E_APP_UI_CLOSED:media delivery retired');
  }
  wake(): void { const resume = this.resume; this.resume = undefined; resume?.(); }
  wait(): Promise<void> {
    return new Promise<void>((resolve: () => void) => { this.resume = resolve; });
  }
}

/** Per RuntimeHost/window, outside the modal queue and logical route ownership. */
export class HarmonyAppUIMediaService {
  private context?: common.UIAbilityContext;
  private readonly directory: string;
  private readonly scope: string;
  private closed: boolean = false;
  private active: boolean = false;
  private page: string = '';
  private retire?: (error: Error) => void;
  private wake?: () => void;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
    this.directory = `${context.cacheDir}/valdi-appui-attachments`;
    this.scope = `${context.applicationInfo.uid}:${context.applicationInfo.name}:${context.cacheDir}`;
  }

  setOwner(page: string, active: boolean): void {
    if (this.closed) return;
    this.page = page;
    this.active = active;
    // A route change never cancels activity/window-owned scanner or picker.
    // Own SDK launches can hide Index; defer delivery rather than guessing why.
    if (active) this.wake?.();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true; this.active = false; this.context = undefined;
    const retire = this.retire;
    this.retire = undefined; this.wake = undefined;
    retire?.(new Error('E_APP_UI_CLOSED:media window was destroyed'));
  }

  private run<T>(work: (delivery: MediaDelivery<T>, context: common.UIAbilityContext) => Promise<T>,
    requireForeground: boolean = true): Promise<T> {
    return new Promise<T>((resolve: (value: T) => void, reject: (error: Error) => void) => {
      if (this.closed || this.context === undefined) { reject(new Error('E_APP_UI_CLOSED:media window is closed')); return; }
      if (requireForeground && (!this.active || this.page.length === 0)) {
        reject(new Error('E_APP_UI_BACKGROUND:no foreground window')); return;
      }
      try { MediaFence.enter(this.scope); } catch (error) { reject(error as Error); return; }
      const delivery = new MediaDelivery<T>(resolve, reject);
      this.retire = (error: Error): void => delivery.fail(error);
      this.wake = (): void => delivery.wake();
      const finish = (): void => {
        this.retire = undefined; this.wake = undefined;
        MediaFence.leave(this.scope);
      };
      // work is invoked synchronously after reservation; no dispatch gap can
      // launch an SDK presenter after close/background. All terminal paths
      // release the fence before reentrant public Promise handlers.
      let pending: Promise<T>;
      try { pending = work(delivery, this.context); }
      catch (error) { finish(); delivery.fail(error as Error); return; }
      pending.then((value: T): void => {
        finish(); delivery.finish(value);
      }, (error: Error): void => {
        finish(); delivery.fail(error);
      });
    });
  }

  private async foreground<T>(delivery: MediaDelivery<T>): Promise<void> {
    delivery.check();
    while (!this.active && !this.closed) { await delivery.wait(); delivery.check(); }
    delivery.check();
  }

  scanCode(): Promise<AppUIMediaScan> {
    return this.run<AppUIMediaScan>(async (delivery: MediaDelivery<AppUIMediaScan>,
      context: common.UIAbilityContext): Promise<AppUIMediaScan> => {
      try {
        const result = await scanBarcode.startScanForResult(context, {
          scanTypes: [scanCore.ScanType.QR_CODE, scanCore.ScanType.EAN13_CODE, scanCore.ScanType.EAN8_CODE,
            scanCore.ScanType.CODE128_CODE, scanCore.ScanType.CODE39_CODE, scanCore.ScanType.UPC_A_CODE],
          enableAlbum: false
        });
        await this.foreground(delivery);
        let type: string = '';
        switch (result.scanType) {
          case scanCore.ScanType.QR_CODE: type = 'QR_CODE'; break;
          case scanCore.ScanType.EAN13_CODE: type = 'EAN_13'; break;
          case scanCore.ScanType.EAN8_CODE: type = 'EAN_8'; break;
          case scanCore.ScanType.CODE128_CODE: type = 'CODE_128'; break;
          case scanCore.ScanType.CODE39_CODE: type = 'CODE_39'; break;
          case scanCore.ScanType.UPC_A_CODE: type = 'UPC_A'; break;
        }
        if (!type || !result.originalValue) throw new Error('No supported code was recognized');
        return { result: result.originalValue, scanType: type };
      } catch (error) {
        // SDK26 explicitly documents 1000500002, not arbitrary "cancel" text.
        delivery.check();
        await this.foreground(delivery);
        if ((error as BusinessError)?.code === 1000500002) throw new Error('cancel');
        throw new Error(`E_SCAN_CODE:${this.message(error as Error)}`);
      }
    });
  }

  pickAttachments(source: string, limit: number, mimeTypes: string[]): Promise<AppUIMediaSelection> {
    return this.run<AppUIMediaSelection>(async (delivery: MediaDelivery<AppUIMediaSelection>,
      context: common.UIAbilityContext): Promise<AppUIMediaSelection> => {
      const paths: string[] = [];
      try {
        if (!['photos', 'files', 'camera'].includes(source)) throw new Error('E_INVALID_SOURCE:unsupported attachment source');
        if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('E_INVALID_COUNT:attachment limit');
        const allowed = (mimeTypes.length ? mimeTypes : ['*/*'])
          .map((mime: string): string => mime.toLowerCase());
        let uris: string[];
        if (source === 'photos') {
          if (!allowed.some((mime: string): boolean => mime === '*/*' || mime.startsWith('image/')))
            throw new Error('E_UNSUPPORTED_MIME_TYPES:photos require images');
          const result = await new photoAccessHelper.PhotoViewPicker().select({
            MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE, maxSelectNumber: limit
          });
          uris = result.photoUris;
        } else if (source === 'files') {
          uris = await new picker.DocumentViewPicker(context).select({
            maxSelectNumber: limit, fileSuffixFilters: this.filters(allowed)
          });
        } else {
          // System camera picker delegates camera permission to its presenter.
          // Do not assume a JPEG output: inspect the returned URI's actual type.
          if (!allowed.some((mime: string): boolean => mime === '*/*' || mime.startsWith('image/')))
            throw new Error('E_UNSUPPORTED_MIME_TYPES:camera requires images');
          const result = await cameraPicker.pick(context, [cameraPicker.PickerMediaType.PHOTO], {
            cameraPosition: camera.CameraPosition.CAMERA_POSITION_BACK
          });
          if (result.resultCode !== 0) throw new Error(`E_ATTACHMENT_LOAD:camera result ${result.resultCode}`);
          // SDK UIExtension OnDestroy/OnRelease(0) produces an empty result.
          // A populated mediaType without its URI is a malformed success.
          // Its native empty media type falls outside the declared PHOTO/VIDEO enum.
          const mediaType: string = String(result.mediaType);
          if (result.resultUri === '' && mediaType === '') uris = [];
          else {
            if (!result.resultUri || mediaType !== cameraPicker.PickerMediaType.PHOTO)
              throw new Error('E_ATTACHMENT_LOAD:invalid camera photo result');
            uris = [result.resultUri];
          }
        }
        await this.foreground(delivery);
        if (uris.length > (source === 'camera' ? 1 : limit) || uris.some((uri: string): boolean => !uri))
          throw new Error('E_ATTACHMENT_LOAD:invalid SDK selection');
        const assets: AppUIMediaAsset[] = [];
        for (const uri of uris) {
          delivery.check();
          assets.push(await this.copy(uri, allowed, paths));
          delivery.check();
        }
        await this.foreground(delivery);
        return { canceled: assets.length === 0, assets };
      } catch (error) {
        // Paths are registered BEFORE copying, including partial outputs and
        // close/stat failures. Cleanup attempts every path even if one fails.
        let cleanupFailed: boolean = false;
        for (const path of paths) {
          try { if (fs.accessSync(path)) await fs.unlink(path); } catch (_) { cleanupFailed = true; }
        }
        delivery.check();
        // Rollback is independent of visibility. Only the live API error
        // delivery waits for this same runtime/window to return foreground.
        await this.foreground(delivery);
        if (cleanupFailed) throw new Error('E_ATTACHMENT_CACHE:partial selection cleanup failed');
        const message = this.message(error as Error);
        throw new Error(message.startsWith('E_') ? message : `E_ATTACHMENT_LOAD:${message}`);
      }
    });
  }

  clearAttachmentCache(): Promise<void> {
    return this.run<void>(async (delivery: MediaDelivery<void>): Promise<void> => {
      try {
        if (fs.accessSync(this.directory)) await fs.rmdir(this.directory);
        delivery.check();
      } catch (error) {
        delivery.check();
        throw new Error(`E_ATTACHMENT_CACHE:${this.message(error as Error)}`);
      }
    }, false);
  }

  private message(error: Error): string { return error?.message || 'SDK operation failed'; }
  private matches(type: string, allowed: string[]): boolean {
    return allowed.some((mime: string): boolean => mime === '*/*' || mime === type ||
      (mime.endsWith('/*') && type.startsWith(mime.slice(0, -1))));
  }
  private mime(name: string): string {
    const index = name.lastIndexOf('.');
    if (index < 0) return 'application/octet-stream';
    try {
      const type = uniformTypeDescriptor.getUniformDataTypeByFilenameExtension(name.slice(index).toLowerCase());
      return (uniformTypeDescriptor.getTypeDescriptor(type).mimeTypes[0] || 'application/octet-stream').toLowerCase();
    } catch (_) { return 'application/octet-stream'; }
  }
  private filters(mimes: string[]): string[] {
    if (mimes.includes('*/*') || mimes.some((mime: string): boolean => mime.endsWith('/*'))) return [];
    const suffixes: string[] = [];
    for (const mime of mimes) {
      try {
        const type = uniformTypeDescriptor.getTypeDescriptor(uniformTypeDescriptor.getUniformDataTypeByMIMEType(mime));
        for (const suffix of type.filenameExtensions) {
          if (/^\.[a-zA-Z0-9]+$/.test(suffix) && !suffixes.includes(suffix)) suffixes.push(suffix);
        }
      } catch (_) { return []; } // Selection is still checked against actual MIME.
    }
    const filter = suffixes.join(',');
    return filter.length > 0 && filter.length <= 100 ? [filter] : [];
  }
  private async copy(uri: string, allowed: string[], paths: string[]): Promise<AppUIMediaAsset> {
    const name = new fileUri.FileUri(uri).name;
    const mimeType = this.mime(name);
    if (!this.matches(mimeType, allowed)) throw new Error('E_UNSUPPORTED_MIME_TYPES:selected file MIME is not permitted');
    const input = await fs.open(uri, fs.OpenMode.READ_ONLY);
    try {
      if (!fs.accessSync(this.directory)) await fs.mkdir(this.directory, true);
      const id = util.generateRandomUUID();
      const suffix = /\.[a-zA-Z0-9]{1,12}$/.exec(name)?.[0] ?? '';
      const path = `${this.directory}/${id}${suffix}`;
      paths.push(path);
      await fs.copyFile(input.fd, path);
      const stat = await fs.stat(path);
      if (!Number.isSafeInteger(stat.size) || stat.size < 0) throw new Error('E_ATTACHMENT_LOAD:invalid file size');
      return { id, uri: fileUri.getUriFromPath(path), name, mimeType, size: stat.size };
    } finally { await fs.close(input); }
  }
}
