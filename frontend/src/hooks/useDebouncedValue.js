import { useEffect, useState } from "react";

/**
 * Restituisce `value` solo quando smette di cambiare per `delay` ms.
 * Usato per la ricerca: una chiamata API a fine digitazione, non una per tasto.
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
