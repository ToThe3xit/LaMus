import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function useLanguage() {
  const { i18n } = useTranslation();

  const [language, setLanguageState] = useState<string>(
    () => localStorage.getItem('lamus-language') || 'en'
  );

  const setLanguage = (code: string) => {
    localStorage.setItem('lamus-language', code);
    setLanguageState(code);
    i18n.changeLanguage(code);
  };

  return { language, setLanguage };
}