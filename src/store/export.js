/**
 * Export, import, and reset all IndexedDB stores as a single JSON payload.
 */

import { STORES, getAllRecords, clearStore, putRecord } from './db.js';

export async function exportAllData() {
  const storesData = {};
  for (const s of STORES) {
    storesData[s] = await getAllRecords(s);
  }
  return {
    app: 'ReadingFaces',
    version: '2.1',
    exportedAt: new Date().toISOString(),
    stores: storesData
  };
}

export async function importAllData(payload) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!data || typeof data !== 'object' || !data.stores) {
    throw new Error('Invalid backup file: missing stores object');
  }
  const counts = {};
  for (const s of STORES) {
    if (Array.isArray(data.stores[s])) {
      await clearStore(s);
      for (const rec of data.stores[s]) {
        await putRecord(s, rec);
      }
      counts[s] = data.stores[s].length;
    }
  }
  return counts;
}

export async function resetAllProgress() {
  for (const s of STORES) {
    await clearStore(s);
  }
}

export async function downloadBackupFile() {
  const payload = await exportAllData();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reading-faces-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return payload;
}

export const exportDatabaseJSON = exportAllData;
export const importDatabaseJSON = importAllData;
