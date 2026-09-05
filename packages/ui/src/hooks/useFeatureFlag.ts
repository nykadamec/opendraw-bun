import { useState } from 'react';

const PREFIX = 'opendraw.feature.';

export function useFeatureFlag(name: string, defaultValue = false): [boolean, (v: boolean) => void] {
  const key = `${PREFIX}${name}`;

  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? saved === 'true' : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedValue = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {}
  };

  return [value, setPersistedValue];
}
