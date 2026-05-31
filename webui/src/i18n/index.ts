import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import pl from './locales/pl.json';
import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import it from './locales/it.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import tr from './locales/tr.json';
import nl from './locales/nl.json';
import sv from './locales/sv.json';
import no from './locales/no.json';
import da from './locales/da.json';
import fi from './locales/fi.json';
import cs from './locales/cs.json';
import sk from './locales/sk.json';
import hu from './locales/hu.json';
import ro from './locales/ro.json';
import bg from './locales/bg.json';
import el from './locales/el.json';
import sr from './locales/sr.json';
import hr from './locales/hr.json';
import sl from './locales/sl.json';
import lt from './locales/lt.json';
import lv from './locales/lv.json';
import et from './locales/et.json';
import ar from './locales/ar.json';
import he from './locales/he.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import ur from './locales/ur.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import vi from './locales/vi.json';
import th from './locales/th.json';
import id from './locales/id.json';
import ms from './locales/ms.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'pl',    label: 'Polski' },
  { code: 'en',    label: 'English' },
  { code: 'de',    label: 'Deutsch' },
  { code: 'fr',    label: 'Français' },
  { code: 'es',    label: 'Español' },
  { code: 'it',    label: 'Italiano' },
  { code: 'pt',    label: 'Português' },
  { code: 'ru',    label: 'Русский' },
  { code: 'uk',    label: 'Українська' },
  { code: 'tr',    label: 'Türkçe' },
  { code: 'nl',    label: 'Nederlands' },
  { code: 'sv',    label: 'Svenska' },
  { code: 'no',    label: 'Norsk' },
  { code: 'da',    label: 'Dansk' },
  { code: 'fi',    label: 'Suomi' },
  { code: 'cs',    label: 'Čeština' },
  { code: 'sk',    label: 'Slovenčina' },
  { code: 'hu',    label: 'Magyar' },
  { code: 'ro',    label: 'Română' },
  { code: 'bg',    label: 'Български' },
  { code: 'el',    label: 'Ελληνικά' },
  { code: 'sr',    label: 'Српски' },
  { code: 'hr',    label: 'Hrvatski' },
  { code: 'sl',    label: 'Slovenščina' },
  { code: 'lt',    label: 'Lietuvių' },
  { code: 'lv',    label: 'Latviešu' },
  { code: 'et',    label: 'Eesti' },
  { code: 'ar',    label: 'العربية' },
  { code: 'he',    label: 'עברית' },
  { code: 'hi',    label: 'हिन्दी' },
  { code: 'bn',    label: 'বাংলা' },
  { code: 'ur',    label: 'اردو' },
  { code: 'zh-CN', label: '中文（简体）' },
  { code: 'zh-TW', label: '中文（繁體）' },
  { code: 'ja',    label: '日本語' },
  { code: 'ko',    label: '한국어' },
  { code: 'vi',    label: 'Tiếng Việt' },
  { code: 'th',    label: 'ภาษาไทย' },
  { code: 'id',    label: 'Bahasa Indonesia' },
  { code: 'ms',    label: 'Bahasa Melayu' },
];

const savedLanguage = localStorage.getItem('lamus-language') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      pl:    { translation: pl },
      en:    { translation: en },
      de:    { translation: de },
      fr:    { translation: fr },
      es:    { translation: es },
      it:    { translation: it },
      pt:    { translation: pt },
      ru:    { translation: ru },
      uk:    { translation: uk },
      tr:    { translation: tr },
      nl:    { translation: nl },
      sv:    { translation: sv },
      no:    { translation: no },
      da:    { translation: da },
      fi:    { translation: fi },
      cs:    { translation: cs },
      sk:    { translation: sk },
      hu:    { translation: hu },
      ro:    { translation: ro },
      bg:    { translation: bg },
      el:    { translation: el },
      sr:    { translation: sr },
      hr:    { translation: hr },
      sl:    { translation: sl },
      lt:    { translation: lt },
      lv:    { translation: lv },
      et:    { translation: et },
      ar:    { translation: ar },
      he:    { translation: he },
      hi:    { translation: hi },
      bn:    { translation: bn },
      ur:    { translation: ur },
      'zh-CN': { translation: zhCN },
      'zh-TW': { translation: zhTW },
      ja:    { translation: ja },
      ko:    { translation: ko },
      vi:    { translation: vi },
      th:    { translation: th },
      id:    { translation: id },
      ms:    { translation: ms },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;