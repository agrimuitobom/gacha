export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}
