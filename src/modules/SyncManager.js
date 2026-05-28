/**
 * SyncManager.js
 * AWS Sync Architecture for SecureFace
 *
 * Sync Flow:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. App detects internet connectivity (NetInfo)
 * 2. SyncManager fetches all unsynced attendance records from SQLite
 * 3. Records are batched and POST'd to the configured AWS endpoint
 * 4. On 200 OK, records are marked synced in SQLite
 * 5. Local cache purge runs based on retentionDays setting
 *
 * AWS Endpoint contract (configurable in Settings):
 *   POST {endpoint}/attendance
 *   Authorization: Bearer {apiKey}
 *   Body: { records: AttendanceRecord[], deviceId: string }
 *   Response: { success: boolean, syncedIds: string[] }
 *
 * For the hackathon demo, set DEMO_MODE = true to simulate sync without a
 * live AWS account. In demo mode, all records are "synced" locally after a
 * short delay.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {DatabaseService} from './DatabaseService';

// Storage keys
const KEYS = {
  ENDPOINT: '@SecureFace:awsEndpoint',
  API_KEY: '@SecureFace:awsApiKey',
  AUTO_SYNC: '@SecureFace:autoSync',
  RETENTION_DAYS: '@SecureFace:retentionDays',
  DEVICE_ID: '@SecureFace:deviceId',
  LAST_SYNC: '@SecureFace:lastSyncTime',
};

// Default configuration
const DEFAULTS = {
  endpoint: 'https://YOUR-API-GATEWAY.execute-api.ap-south-1.amazonaws.com/prod',
  apiKey: '',
  autoSync: true,
  retentionDays: 30,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSettings() {
  const [endpoint, apiKey, autoSync, retentionDays, deviceId] =
    await Promise.all([
      AsyncStorage.getItem(KEYS.ENDPOINT),
      AsyncStorage.getItem(KEYS.API_KEY),
      AsyncStorage.getItem(KEYS.AUTO_SYNC),
      AsyncStorage.getItem(KEYS.RETENTION_DAYS),
      AsyncStorage.getItem(KEYS.DEVICE_ID),
    ]);

  return {
    endpoint: endpoint || DEFAULTS.endpoint,
    apiKey: apiKey || DEFAULTS.apiKey,
    autoSync: autoSync === null ? DEFAULTS.autoSync : autoSync === 'true',
    retentionDays: retentionDays ? parseInt(retentionDays, 10) : DEFAULTS.retentionDays,
    deviceId: deviceId || `device_${Date.now()}`,
  };
}

async function isConnected() {
  const state = await NetInfo.fetch();
  return state.isConnected && state.isInternetReachable;
}

// ─── SyncManager ─────────────────────────────────────────────────────────────
export const SyncManager = {
  _syncing: false, // Prevent concurrent sync operations

  /**
   * Called at app start and whenever connectivity changes.
   * Only syncs if autoSync is enabled and device is online.
   */
  async checkAndSync() {
    const settings = await getSettings();
    if (!settings.autoSync) {
      console.log('[Sync] Auto-sync disabled');
      return;
    }
    const connected = await isConnected();
    if (!connected) {
      console.log('[Sync] Offline — sync deferred');
      return;
    }
    return this.syncNow();
  },

  /**
   * Perform a full sync cycle:
   *   1. Fetch unsynced records
   *   2. POST to AWS (or demo mode)
   *   3. Mark synced
   *   4. Purge old cache
   *
   * @param {boolean} demoMode - If true, simulate sync without real HTTP call
   * @returns {Promise<{ success: boolean, syncedCount: number, error?: string }>}
   */
  async syncNow(demoMode = false) {
    if (this._syncing) {
      return {success: false, error: 'Sync already in progress'};
    }
    this._syncing = true;

    try {
      const settings = await getSettings();
      const unsyncedRecords = await DatabaseService.getUnsyncedAttendance();

      if (unsyncedRecords.length === 0) {
        console.log('[Sync] Nothing to sync');
        return {success: true, syncedCount: 0};
      }

      console.log(`[Sync] Syncing ${unsyncedRecords.length} records...`);

      let syncedIds = [];

      if (demoMode || !settings.endpoint || settings.endpoint.includes('YOUR-API')) {
        // ── DEMO MODE ──────────────────────────────────────────────────────
        // Simulate network delay and mark all records as synced
        await new Promise(r => setTimeout(r, 1500));
        syncedIds = unsyncedRecords.map(r => r.id);
        console.log('[Sync] DEMO MODE: Simulated sync complete');
      } else {
        // ── PRODUCTION MODE ────────────────────────────────────────────────
        const response = await fetch(`${settings.endpoint}/attendance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(settings.apiKey && {Authorization: `Bearer ${settings.apiKey}`}),
          },
          body: JSON.stringify({
            records: unsyncedRecords,
            deviceId: settings.deviceId,
            syncedAt: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        syncedIds = result.syncedIds || unsyncedRecords.map(r => r.id);
      }

      // Mark records synced in SQLite
      await DatabaseService.markAttendanceSynced(syncedIds);

      // Purge old synced records based on retention policy
      await DatabaseService.purgeLocalCache(settings.retentionDays);

      // Update last sync timestamp
      await AsyncStorage.setItem(KEYS.LAST_SYNC, new Date().toISOString());

      console.log(`[Sync] ✅ Synced ${syncedIds.length} records`);
      return {success: true, syncedCount: syncedIds.length};
    } catch (err) {
      console.error('[Sync] ❌ Sync failed:', err.message);
      return {success: false, syncedCount: 0, error: err.message};
    } finally {
      this._syncing = false;
    }
  },

  /**
   * Get the last sync timestamp (human-readable).
   */
  async getLastSyncTime() {
    const ts = await AsyncStorage.getItem(KEYS.LAST_SYNC);
    return ts || null;
  },

  /**
   * Count of records waiting to sync.
   */
  async getPendingCount() {
    return DatabaseService.getPendingSyncCount();
  },

  /**
   * Save AWS settings from the Settings screen.
   */
  async saveSettings({endpoint, apiKey, autoSync, retentionDays}) {
    await Promise.all([
      endpoint !== undefined
        ? AsyncStorage.setItem(KEYS.ENDPOINT, endpoint)
        : Promise.resolve(),
      apiKey !== undefined
        ? AsyncStorage.setItem(KEYS.API_KEY, apiKey)
        : Promise.resolve(),
      autoSync !== undefined
        ? AsyncStorage.setItem(KEYS.AUTO_SYNC, String(autoSync))
        : Promise.resolve(),
      retentionDays !== undefined
        ? AsyncStorage.setItem(KEYS.RETENTION_DAYS, String(retentionDays))
        : Promise.resolve(),
    ]);
  },

  async loadSettings() {
    return getSettings();
  },
};

export default SyncManager;
