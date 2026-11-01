import { useEffect, useState } from 'react';
// Remembers which demo persona is selected, across page reloads.
import { DEFAULT_PERSONA_ID } from '../../shared/personas.js';

const KEY = 'pulse-demo-persona';

export function loadPersonaId() {
  try {
    return localStorage.getItem(KEY) || DEFAULT_PERSONA_ID;
  } catch {
    return DEFAULT_PERSONA_ID;
  }
}

export function savePersonaId(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: ignore */
  }
  window.dispatchEvent(new CustomEvent('pulse-persona', { detail: id }));
}

// Re-renders the caller whenever the persona switcher picks someone new.
export function usePersonaId() {
  const [id, setId] = useState(loadPersonaId);
  useEffect(() => {
    const on = (e) => setId(e.detail);
    window.addEventListener('pulse-persona', on);
    return () => window.removeEventListener('pulse-persona', on);
  }, []);
  return id;
}
