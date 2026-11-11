import { overrideLocales, removeOverrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';
import { createStore } from 'zustand/vanilla';
import Strings from 'app_pages/src/Strings';

export type AppLanguage = 'en' | 'zh-CN' | undefined;

/** undefined follows the official device-locale resolver. */
export const languageStore = createStore<{ language: AppLanguage }>(() => ({ language: undefined }));

export function selectLanguage(language: AppLanguage): void {
  if (language === undefined) {
    removeOverrideLocales(Strings);
  } else {
    overrideLocales(Strings, () => [Locale.parse(language)]);
  }
  languageStore.setState({ language });
}
