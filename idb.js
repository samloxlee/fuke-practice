// 极简 IndexedDB 封装：所有数据存在平板本地
const DB_NAME = "fuke";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const stores = [
        "meta", "lessons", "kps", "items", "questions",
        "attempts", "wrong", "reviews", "settings",
      ];
      for (const name of stores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function write(name, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(name, "readwrite");
        fn(tx.objectStore(name));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

export async function put(name, value) {
  await write(name, (s) => s.put(value));
}

export async function putAll(name, values) {
  if (!values.length) return;
  await write(name, (s) => {
    for (const v of values) s.put(v);
  });
}

export async function getAll(name) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(name, "readonly").objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(name, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(name, "readonly").objectStore(name).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function del(name, id) {
  await write(name, (s) => s.delete(id));
}

export async function clear(name) {
  await write(name, (s) => s.clear());
}

export async function clearAll() {
  for (const name of ["meta", "lessons", "kps", "items", "questions", "attempts", "wrong", "reviews", "settings"]) {
    await clear(name);
  }
}
