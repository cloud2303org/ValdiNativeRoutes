import { createSignal } from 'solid-js';
import { overrideLocales, removeOverrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';
import Strings from 'app_pages/src/Strings';

export type AppLanguage = 'en' | 'zh-CN' | undefined;

/** undefined follows the official device-locale resolver. */
const [language, setLanguage] = createSignal<AppLanguage>(undefined);

export { language };

export function selectLanguage(next: AppLanguage): void {
  if (next === undefined) {
    removeOverrideLocales(Strings);
  } else {
    overrideLocales(Strings, () => [Locale.parse(next)]);
  }
  setLanguage(next);
}
