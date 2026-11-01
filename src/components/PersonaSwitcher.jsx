// Switches the LaunchDarkly context to a different demo persona with
// ldClient.identify(). Flags re-evaluate for the new context right away,
// which is how we show individual and rule-based targeting (Part 2).
import { useState } from 'react';
import { useLDClient } from '@launchdarkly/react-sdk';
import { PERSONAS, getPersona } from '../../shared/personas.js';
import { loadPersonaId, savePersonaId } from '../ld/persona-store.js';
import DemoChip from './DemoChip.jsx';

export default function PersonaSwitcher() {
  const client = useLDClient();
  const [personaId, setPersonaId] = useState(loadPersonaId);
  const [busy, setBusy] = useState(false);
  const persona = getPersona(personaId);

  async function choose(id) {
    setPersonaId(id);
    savePersonaId(id);
    setBusy(true);
    try {
      await client?.identify(getPersona(id).context);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="persona">
      <label htmlFor="persona-select"><DemoChip /> Viewing as</label>
      <select id="persona-select" value={personaId} onChange={(e) => choose(e.target.value)} disabled={busy}>
        {PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <small>{busy ? 'Switching context…' : persona.blurb}</small>
    </div>
  );
}
