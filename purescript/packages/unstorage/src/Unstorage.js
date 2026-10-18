import { createStorage as create, defineDriver as define } from "unstorage";

// unstorage normalises keys (":" separators) itself; raw strings are stored.
export const defineDriverImpl = (d) =>
  define(() => ({
    name: d.name,
    hasItem: (key) => d.hasItem(key)(),
    getItem: (key) => d.getItem(key)(),
    setItem: (key, value) => d.setItem(key)(String(value))(),
    removeItem: (key) => d.removeItem(key)(),
    getKeys: (base) => d.getKeys(base ?? "")(),
    getMeta: (key) => d.getMeta(key)(),
    clear: () => d.clear(),
    dispose: () => d.dispose(),
  }))();

export const createStorage = (driver) => () => create({ driver });
export const getItemImpl = (s) => (k) => () => s.getItemRaw(k).then((v) => (v === undefined || v === null ? null : String(v)));
export const setItemImpl = (s) => (k) => (v) => () => s.setItemRaw(k, v);
export const hasItemImpl = (s) => (k) => () => s.hasItem(k);
export const removeItemImpl = (s) => (k) => () => s.removeItem(k);
export const getKeysImpl = (s) => (b) => () => s.getKeys(b);
export const getMetaImpl = (s) => (k) => () => s.getMeta(k).then((m) => (m && (m.birthtime || m.mtime) ? { birthtime: m.birthtime ?? null, mtime: m.mtime ?? null } : null));
export const clearImpl = (s) => () => s.clear();
