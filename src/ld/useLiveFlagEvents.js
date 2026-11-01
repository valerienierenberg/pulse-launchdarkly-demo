// Subscribes to the SDK's "change" event so the UI can *show* when a flag
// changes. (The variation hooks already re-render on their own; this is only
// for the on-screen "flag changed" notices and the live-feed panel.)
import { useEffect, useState } from 'react';
import { useLDClient } from '@launchdarkly/react-sdk';

export function useLiveFlagEvents(limit = 8) {
  const client = useLDClient();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!client) return undefined;
    const onChange = (_context, changedKeys = []) => {
      const flags = client.allFlags();
      const at = new Date();
      setEvents((prev) =>
        [
          ...changedKeys.map((key) => ({ id: `${key}-${at.getTime()}`, key, value: flags[key], at })),
          ...prev,
        ].slice(0, limit),
      );
    };
    client.on('change', onChange);
    return () => client.off('change', onChange);
  }, [client, limit]);

  return events;
}

// Returns the server-resolved context (anonymous contexts get a generated
// key), to send along with API calls so the server evaluates the same context.
export function useCurrentContext() {
  const client = useLDClient();
  return () => client?.getContext?.();
}
