// El artefacto de Claude.ai inyecta window.storage automáticamente. Fuera de ahí no existe,
// así que lo emulamos con localStorage antes de que la app arranque.
//
// Es lo único que hay que cambiar si algún día pasas a un backend real: sustituye el cuerpo
// de estos cuatro métodos por llamadas fetch y el resto de la app no se entera.
const PREFIX = "kikudes:";
const keyFor = (key, shared) => `${PREFIX}${shared ? "shared:" : "mine:"}${key}`;

export function installStorage() {
  if (typeof window === "undefined" || window.storage) return;
  window.storage = {
    get(key, shared) {
      return new Promise((resolve, reject) => {
        const value = localStorage.getItem(keyFor(key, shared));
        if (value === null) reject(new Error("not found"));
        else resolve({ key, value, shared: !!shared });
      });
    },
    set(key, value, shared) {
      return new Promise((resolve) => {
        localStorage.setItem(keyFor(key, shared), value);
        resolve({ key, value, shared: !!shared });
      });
    },
    delete(key, shared) {
      return new Promise((resolve) => {
        localStorage.removeItem(keyFor(key, shared));
        resolve({ key, deleted: true, shared: !!shared });
      });
    },
    list(prefix, shared) {
      return new Promise((resolve) => {
        const scope = `${PREFIX}${shared ? "shared:" : "mine:"}`;
        const full = scope + (prefix || "");
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith(full)) keys.push(k.slice(scope.length));
        }
        resolve({ keys, prefix, shared: !!shared });
      });
    },
  };
}
