// Debugger messages may only resolve a callback registered for a numeric request.
export function resolveResponse(pending, message) {
  if (!message || typeof message !== "object" || !Number.isSafeInteger(message.id) || message.id <= 0) return;
  const callback = pending.get(message.id);
  if (typeof callback !== "function") return;
  pending.delete(message.id);
  callback(message);
}

// Keep labels as literals even when code is embedded in an HTML script context.
export function codeLiteral(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
