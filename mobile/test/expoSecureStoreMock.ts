const values = new Map<string, string>();
export const getItem = (key: string) => values.get(key) ?? null;
export const setItem = (key: string, value: string) => { values.set(key, value); };
export const deleteItemAsync = async (key: string) => { values.delete(key); };
