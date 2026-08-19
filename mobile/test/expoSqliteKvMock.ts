const values = new Map<string, string>();

export default {
  getItemSync: (key: string) => values.get(key) ?? null,
  setItemSync: (key: string, value: string) => { values.set(key, value); },
  removeItemSync: (key: string) => values.delete(key),
};
