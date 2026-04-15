import { useState, useCallback } from "react";

export function useSessionStorage<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.sessionStorage.getItem(key);
      if (item) {
        return JSON.parse(item) as T;
      }
    } catch (error) {
      console.warn(`Error reading sessionStorage key "${key}":`, error);
    }
    return initialValue;
  });

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
