export type LinkEventType =
  | "link:created"
  | "link:updated"
  | "link:deleted"
  | "link:archived";

export interface LinkEvent {
  type: LinkEventType;
  linkId: string;
  userId: string;
  timestamp: string;
}

type Listener = (event: LinkEvent) => void;

const listeners = new Set<Listener>();

export function emitLinkEvent(event: Omit<LinkEvent, "timestamp">): void {
  const full: LinkEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  for (const listener of listeners) {
    try {
      listener(full);
    } catch {
      // Don't let one listener failure break others
    }
  }
}

export function onLinkEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
