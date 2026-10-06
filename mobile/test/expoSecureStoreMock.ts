const values = new Map<string, string>();
function validateKey(key: string) {
  if (!/^[\w.-]+$/.test(key)) throw new Error('Invalid SecureStore key');
}
export const getItem = (key: string) => { validateKey(key); return values.get(key) ?? null; };
export const setItem = (key: string, value: string) => { validateKey(key); values.set(key, value); };
export const deleteItemAsync = async (key: string) => { validateKey(key); values.delete(key); };
