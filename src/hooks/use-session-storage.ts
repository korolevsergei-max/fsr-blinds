import { useState, useCallback, useEffect } from "react";

export function useSessionStorage<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(initialValue);

  useEffect(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      if (item) {
        setState(JSON.parse(item) as T);
      }
    } catch (error) {
      console.warn(`Error reading sessionStorage key "${key}":`, error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    setState((prevState) => {
      const nextValue = value instanceof Function ? value(prevState) : value;
      try {
        window.sessionStorage.setItem(key, JSON.stringify(nextValue));
      } catch (error) {
        console.warn(`Error setting sessionStorage key "${key}":`, error);
      }
      return nextValue;
    });
  }, [key]);

  return [state, setValue] as const;
}
