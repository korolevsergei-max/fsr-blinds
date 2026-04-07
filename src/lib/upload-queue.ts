"use client";

const DB_NAME = "fsr-upload-queue";
const DB_VERSION = 1;
const STORE_NAME = "pending-uploads";

export type QueuedUpload = {
  id: string;
  formDataEntries: [string, string][];
  fileData: ArrayBuffer | null;
  fileName: string | null;
  fileType: string | null;
  actionName: string;
  status: "queued" | "uploading" | "failed";
  retries: number;
  createdAt: number;
  errorMessage?: string;
};

type UploadQueueListener = (items: QueuedUpload[]) => void;

const listeners = new Set<UploadQueueListener>();
let processingActive = false;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllItems(): Promise<QueuedUpload[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putItem(item: QueuedUpload): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteItem(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function notifyListeners() {
  getAllItems().then((items) => {
    listeners.forEach((fn) => fn(items));
  });
}

export function subscribeToQueue(fn: UploadQueueListener): () => void {
  listeners.add(fn);
  getAllItems().then((items) => fn(items));
  return () => listeners.delete(fn);
}

export async function enqueueUpload(
  actionName: string,
  formData: FormData
): Promise<string> {
  const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entries: [string, string][] = [];
  let fileData: ArrayBuffer | null = null;
  let fileName: string | null = null;
  let fileType: string | null = null;

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      fileData = await value.arrayBuffer();
      fileName = value.name;
      fileType = value.type;
    } else {
      entries.push([key, value as string]);
    }
  }

  const item: QueuedUpload = {
    id,
    formDataEntries: entries,
    fileData,
    fileName,
    fileType,
    actionName,
    status: "queued",
    retries: 0,
    createdAt: Date.now(),
  };

  await putItem(item);
  notifyListeners();
  processQueue();
  return id;
}

export async function getQueuedUploads(): Promise<QueuedUpload[]> {
  return getAllItems();
}

export async function retryFailed(): Promise<void> {
  const items = await getAllItems();
  for (const item of items) {
    if (item.status === "failed") {
      item.status = "queued";
      item.retries = 0;
      item.errorMessage = undefined;
      await putItem(item);
    }
  }
  notifyListeners();
  processQueue();
}

// Action registry — photo forms register their server actions here
const actionRegistry = new Map<string, (fd: FormData) => Promise<{ ok: boolean; error?: string }>>();

export function registerUploadAction(
  name: string,
  action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>
) {
  actionRegistry.set(name, action);
}

const MAX_RETRIES = 5;

async function processQueue(): Promise<void> {
  if (processingActive) return;
  processingActive = true;

  try {
    while (true) {
      const items = await getAllItems();
      const next = items.find((i) => i.status === "queued");
      if (!next) break;

      next.status = "uploading";
      await putItem(next);
      notifyListeners();

      const action = actionRegistry.get(next.actionName);
      if (!action) {
        next.status = "failed";
        next.errorMessage = `Unknown action: ${next.actionName}`;
        await putItem(next);
        notifyListeners();
        continue;
      }

      const fd = new FormData();
      for (const [key, value] of next.formDataEntries) {
        fd.set(key, value);
      }
      if (next.fileData && next.fileName) {
        const blob = new Blob([next.fileData], { type: next.fileType ?? "image/jpeg" });
        fd.set("photo", new File([blob], next.fileName, { type: next.fileType ?? "image/jpeg" }));
      }

      try {
        const result = await action(fd);
        if (result.ok) {
          await deleteItem(next.id);
          notifyListeners();
        } else {
          next.retries += 1;
          if (next.retries >= MAX_RETRIES) {
            next.status = "failed";
            next.errorMessage = result.error ?? "Upload failed after retries";
          } else {
            next.status = "queued";
            next.errorMessage = result.error;
          }
          await putItem(next);
          notifyListeners();
          // Wait before retrying
          await new Promise((r) => setTimeout(r, Math.min(2000 * Math.pow(2, next.retries), 30000)));
        }
      } catch {
        next.retries += 1;
        if (next.retries >= MAX_RETRIES) {
          next.status = "failed";
          next.errorMessage = "Network error — will retry when online";
        } else {
          next.status = "queued";
          next.errorMessage = "Network error";
        }
        await putItem(next);
        notifyListeners();
        // Wait with exponential backoff
        await new Promise((r) => setTimeout(r, Math.min(3000 * Math.pow(2, next.retries), 60000)));
      }
    }
  } finally {
    processingActive = false;
  }
}

// Restart queue processing when coming back online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => processQueue());
}
