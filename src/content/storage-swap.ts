export function saveLocalStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        data[key] = value;
      }
    }
  }
  return data;
}

export function saveSessionStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key !== null) {
      const value = sessionStorage.getItem(key);
      if (value !== null) {
        data[key] = value;
      }
    }
  }
  return data;
}

export function restoreLocalStorage(data: Record<string, string>): void {
  localStorage.clear();
  for (const [key, value] of Object.entries(data)) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn(`[Unaware Sessions] Failed to restore localStorage key "${key}":`, err);
    }
  }
}

export function restoreSessionStorage(data: Record<string, string>): void {
  sessionStorage.clear();
  for (const [key, value] of Object.entries(data)) {
    try {
      sessionStorage.setItem(key, value);
    } catch (err) {
      console.warn(`[Unaware Sessions] Failed to restore sessionStorage key "${key}":`, err);
    }
  }
}
