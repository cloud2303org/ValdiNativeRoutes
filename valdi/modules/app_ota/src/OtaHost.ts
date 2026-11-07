/** @ExportModel({ios: 'VROtaInfo', android: 'io.valdiroutes.ota.OtaInfo'}) */
export interface OtaInfo {
  enabled: boolean;
  appVersion: string;
  embeddedBundleVersion: string;
  /** The version used by this process, unchanged by downloads. */
  bundleVersion: string;
  /** A downloaded version to apply on the next cold start. */
  pendingBundleVersion?: string;
}

/** @ExportProxy({ios: 'VROtaHost', android: 'io.valdiroutes.ota.OtaHost'}) */
export interface OtaHost {
  getInfo(): Promise<OtaInfo>;
  /** Checks and downloads an update; resolves after staging, without restarting. */
  checkForUpdate(): Promise<OtaInfo>;
}
