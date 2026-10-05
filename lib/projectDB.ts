import type { Project } from './audio/types'

// Keeps the current project (regions as JSON, original audio files as bytes)
// in IndexedDB so work survives a reload.

const DB_NAME = 'DirectMontageDB'
const DB_VERSION = 3
const SOURCES = 'sources'
const PROJECT = 'project'
const PROJECT_KEY = 'current'
// Stores written by the single-file version of the app.
const LEGACY_AUDIO = 'audioFiles'
const LEGACY_HISTORY = 'audioHistory'

export interface StoredSource {
  id: string
  name: string
  type: string
  data: ArrayBuffer
}

export interface StoredProject {
  name: string
  project: Project
}

interface LegacyAudio {
  data: ArrayBuffer
  name: string
  type: string
  fileName?: string
}

let connection: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(SOURCES)) {
          db.createObjectStore(SOURCES, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(PROJECT)) {
          db.createObjectStore(PROJECT)
        }
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          connection = null
        }
        resolve(db)
      }
      request.onerror = () => reject(request.error)
    })
    connection.catch(() => {
      connection = null
    })
  }
  return connection
}

const completion = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

export async function loadStoredProject(): Promise<{
  stored: StoredProject | null
  sources: StoredSource[]
}> {
  const db = await openDB()
  const transaction = db.transaction([PROJECT, SOURCES], 'readonly')
  const projectRequest = transaction.objectStore(PROJECT).get(PROJECT_KEY)
  const sourcesRequest = transaction.objectStore(SOURCES).getAll()
  await completion(transaction)
  return {
    stored: (projectRequest.result as StoredProject | undefined) ?? null,
    sources: sourcesRequest.result as StoredSource[],
  }
}

export async function saveStoredProject(stored: StoredProject): Promise<void> {
  const db = await openDB()
  const transaction = db.transaction(PROJECT, 'readwrite')
  transaction.objectStore(PROJECT).put(stored, PROJECT_KEY)
  await completion(transaction)
}

export async function saveStoredSource(source: StoredSource): Promise<void> {
  const db = await openDB()
  const transaction = db.transaction(SOURCES, 'readwrite')
  transaction.objectStore(SOURCES).put(source)
  await completion(transaction)
}

export async function deleteStoredSources(ids: string[]): Promise<void> {
  const db = await openDB()
  const transaction = db.transaction(SOURCES, 'readwrite')
  ids.forEach((id) => transaction.objectStore(SOURCES).delete(id))
  await completion(transaction)
}

export async function clearStoredProject(): Promise<void> {
  const db = await openDB()
  const stores = [SOURCES, PROJECT, LEGACY_AUDIO, LEGACY_HISTORY].filter(
    (name) => db.objectStoreNames.contains(name)
  )
  const transaction = db.transaction(stores, 'readwrite')
  stores.forEach((name) => transaction.objectStore(name).clear())
  await completion(transaction)
}

/** The file kept by the previous single-file version of the app, if any. */
export async function readLegacyAudio(): Promise<StoredSource | null> {
  const db = await openDB()
  if (!db.objectStoreNames.contains(LEGACY_AUDIO)) return null
  const transaction = db.transaction(LEGACY_AUDIO, 'readonly')
  const request = transaction.objectStore(LEGACY_AUDIO).get('currentAudio')
  await completion(transaction)
  const legacy = request.result as LegacyAudio | undefined
  if (!legacy?.data) return null
  return {
    id: 'src_legacy',
    name: legacy.fileName || legacy.name,
    type: legacy.type,
    data: legacy.data,
  }
}

export async function clearLegacyAudio(): Promise<void> {
  const db = await openDB()
  const stores = [LEGACY_AUDIO, LEGACY_HISTORY].filter((name) =>
    db.objectStoreNames.contains(name)
  )
  if (stores.length === 0) return
  const transaction = db.transaction(stores, 'readwrite')
  stores.forEach((name) => transaction.objectStore(name).clear())
  await completion(transaction)
}
