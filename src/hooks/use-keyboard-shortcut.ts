import { useEffect } from "react";

export function useKeyboardShortcut(key: string, callback: () => void, metaKey = true) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const matchMeta = metaKey ? e.metaKey || e.ctrlKey : true;
      if (matchMeta && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [key, callback, metaKey]);
}
