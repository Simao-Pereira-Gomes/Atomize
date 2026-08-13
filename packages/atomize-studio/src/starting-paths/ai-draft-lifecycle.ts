/** Owns Studio's local cancellation boundary, including work before a sidecar session exists. */
export function createAIDraftLifecycle(createId: () => string = () => crypto.randomUUID()) {
  let activeId = "";
  return {
    begin: () => { activeId = createId(); return activeId; },
    cancel: (id: string) => { if (activeId === id) activeId = ""; },
    isActive: (id: string) => activeId === id,
  };
}
