// In-browser storage: one IndexedDB database holding projects and their pictures.
// Nothing leaves the browser unless the person exports it.
import type { ImageRecord, ImageSummary, Project, ProjectKind } from "./types";

const DB_NAME = "edgeai";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("images")) {
        const images = db.createObjectStore("images", { keyPath: "id" });
        images.createIndex("projectId", "projectId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Close other EdgeAI tabs, then reload this one."));
  });
  return dbPromise;
}

/** For tests: forget the open connection so a fresh database can be used. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted"));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---- projects

export async function createProject(name: string, kind: ProjectKind = "detect"): Promise<Project> {
  const now = Date.now();
  const project: Project = { id: newId(), name: name.trim() || "Untitled project", kind, createdAt: now, updatedAt: now };
  const db = await openDb();
  const tx = db.transaction("projects", "readwrite");
  tx.objectStore("projects").put(project);
  await done(tx);
  return project;
}

export async function listProjects(): Promise<Project[]> {
  const db = await openDb();
  const all = await request(db.transaction("projects").objectStore("projects").getAll() as IDBRequest<Project[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await openDb();
  return request(db.transaction("projects").objectStore("projects").get(id) as IDBRequest<Project | undefined>);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const p = await getProject(id);
  if (!p) return;
  await putProject({ ...p, name: name.trim() || p.name, updatedAt: Date.now() });
}

async function putProject(p: Project): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("projects", "readwrite");
  tx.objectStore("projects").put(p);
  await done(tx);
}

async function touchProject(id: string): Promise<void> {
  const p = await getProject(id);
  if (p) await putProject({ ...p, updatedAt: Date.now() });
}

/** Deletes a project and every picture in it. */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["projects", "images"], "readwrite");
  tx.objectStore("projects").delete(id);
  const idx = tx.objectStore("images").index("projectId");
  const keys = await request(idx.getAllKeys(id));
  for (const k of keys) tx.objectStore("images").delete(k);
  await done(tx);
}

// ---- images

export async function addImages(records: ImageRecord[]): Promise<void> {
  if (!records.length) return;
  const db = await openDb();
  const tx = db.transaction("images", "readwrite");
  for (const r of records) tx.objectStore("images").put(r);
  await done(tx);
  await touchProject(records[0].projectId);
}

/** Every picture in a project, newest first, without the full-size blobs. */
export async function listImages(projectId: string): Promise<ImageSummary[]> {
  const db = await openDb();
  const all = await request(
    db.transaction("images").objectStore("images").index("projectId").getAll(projectId) as IDBRequest<ImageRecord[]>,
  );
  return all
    .map(({ blob: _blob, ...rest }) => rest)
    .sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
}

export async function getImage(id: string): Promise<ImageRecord | undefined> {
  const db = await openDb();
  return request(db.transaction("images").objectStore("images").get(id) as IDBRequest<ImageRecord | undefined>);
}

export async function countImages(projectId: string): Promise<number> {
  const db = await openDb();
  return request(db.transaction("images").objectStore("images").index("projectId").count(projectId));
}

export async function deleteImages(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  const tx = db.transaction("images", "readwrite");
  for (const id of ids) tx.objectStore("images").delete(id);
  await done(tx);
}

export async function updateImages(ids: string[], change: Partial<Pick<ImageRecord, "split" | "boxes" | "name">>): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  const tx = db.transaction("images", "readwrite");
  const store = tx.objectStore("images");
  for (const id of ids) {
    const rec = await request(store.get(id) as IDBRequest<ImageRecord | undefined>);
    if (rec) store.put({ ...rec, ...change });
  }
  await done(tx);
}
