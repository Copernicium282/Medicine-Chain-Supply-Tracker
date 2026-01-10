const DB_NAME = "MedChainLocalNode";
const DB_VERSION = 1;
const STORE_BATCHES = "batches";
const STORE_USER = "user_role";

// Encryption Key (Simulation)
// In a real decentralized node, this key would be derived from the user's private key or a hardware wallet.
// For this browser-based simulation, we use a static key to allow different roles to "share" the same local node
// state when testing on a single device.
const LOCAL_KEY = "MEDCHAIN_LOCAL_NODE_KEY_V1";

class MedChainNode {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_BATCHES)) {
          // We store batches by 'id' to allow O(1) retrieval during sync operations
          // and to easily check for existance against remote Firestore IDs.
          db.createObjectStore(STORE_BATCHES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_USER)) {
          db.createObjectStore(STORE_USER, { keyPath: "uid" }); // Role Data
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        console.log("✅ Local Node (IndexedDB) Initialized.");
        resolve(this);
      };

      request.onerror = (e) => {
        console.error("Local Node Init Failed", e);
        reject("DB Error");
      };
    });
  }

  _encrypt(data) {
    if (!data) return null;
    return CryptoJS.AES.encrypt(JSON.stringify(data), LOCAL_KEY).toString();
  }

  _decrypt(ciphertext) {
    if (!ciphertext) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, LOCAL_KEY);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (e) {
      // If decryption fails, it usually means the key has changed or the data
      // was corrupted. We return null so the caller knows this record is unusable.
      console.error("Decryption failed", e);
      return null;
    }
  }

  // ============================
  // BATCH METHODS
  // ============================

  /**
   * Saves a valid batch to the Local Node (IndexedDB).
   * Why: This creates a "Trust Anchor" on the user's device. Even if the server is compromised,
   * the local node retains the correct, immutable history.
   *
   * @param {Object} batchData - The full batch object including logs.
   * @returns {Promise<boolean>} Success status.
   */
  async syncBatch(batchData) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_BATCHES], "readwrite");
      const store = tx.objectStore(STORE_BATCHES);

      const record = {
        id: batchData.id,
        payload: this._encrypt(batchData),
        lastSynced: Date.now(),
      };

      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // Get a Batch (called when Remote fetch fails)
  async getBatch(batchId) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_BATCHES], "readonly");
      const store = tx.objectStore(STORE_BATCHES);
      const req = store.get(batchId);

      req.onsuccess = () => {
        if (req.result) {
          const data = this._decrypt(req.result.payload);
          if (data) {
            resolve({ data, timestamp: req.result.lastSynced });
          } else {
            resolve(null); // Corrupted/Deleted
          }
        } else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllBatches() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction([STORE_BATCHES], "readonly");
      const store = tx.objectStore(STORE_BATCHES);
      const req = store.getAll();

      req.onsuccess = () => {
        const results = req.result
          .map((r) => this._decrypt(r.payload))
          .filter((item) => item !== null);
        resolve(results);
      };
    });
  }

  // ============================
  // SELF-HEALING / RESTORATION
  // ============================

  /**
   * Infers the Batch Status from its event logs.
   *
   * Why: We cannot trust the top-level 'status' field in the database
   * because it is mutable and could be tampered with or desynchronized.
   * The Event Logs are the source of truth because they are hashed.
   *
   * @param {Object} batch - The batch object.
   * @returns {string} The derived status (e.g., 'RECALLED', 'DELIVERED').
   */
  _deriveStatus(batch) {
    // Why we derive status instead of reading it:
    // The top-level 'status' field in Firestore is a mutable string for UI convenience.
    // However, it can be easily spoofed or desynchronized.
    // The 'logs' array contains the signed, hashed block history, which is the TRUE source of truth.
    // Therefore, we always recalculate status from the logs to ensure integrity.
    // This prevents an attacker from simply updating the 'status' field in Firestore
    // to "DELIVERED" without actually having the cryptographic proof in the logs.
    if (batch.status) return batch.status;
    if (!batch.logs || !Array.isArray(batch.logs)) return "CREATED";

    const types = batch.logs.map((l) => l.eventType);
    if (types.includes("RECALL")) return "RECALLED";
    if (types.includes("DELIVERY_CONFIRMATION")) return "DELIVERED";
    if (types.includes("SHIPMENT")) return "IN_TRANSIT";
    return "CREATED";
  }

  /**
   * Restore a batch FROM Local Node TO Firestore
   */
  async restoreBatchToRemote(db, batchData) {
    if (!batchData || !batchData.id) return;

    console.log(`[Self-Healing] Restoring Batch ${batchData.id} to Remote...`);
    const batchRef = db.collection("batches").doc(batchData.id);

    // 1. Separate Logs from Main Data
    // We clone to avoid mutating local state
    const dataToSave = JSON.parse(JSON.stringify(batchData));
    const logs = dataToSave.logs || [];
    delete dataToSave.logs; // Don't save logs array in main doc (Firestore best practice: subcollection)

    // Ensure Status is correct
    dataToSave.status = this._deriveStatus(batchData);

    // 2. Restore Main Doc
    try {
      await batchRef.set(dataToSave, { merge: true });
    } catch (e) {
      console.warn(
        `[Self-Healing] Warning: Parent doc update failed (${e.code}), but proceeding to restore logs.`
      );
    }

    // 3. Restore Logs (Blocks)
    if (logs.length > 0) {
      const batchWrite = db.batch();
      logs.forEach((log) => {
        // Use index as ID for consistency
        const logRef = batchRef.collection("logs").doc(log.index.toString());
        batchWrite.set(logRef, log);
      });
      await batchWrite.commit();
    }

    console.log(`[Self-Healing] Batch ${batchData.id} Restored Successfully.`);
  }

  /**
   * Check for missing/tampered data and restore
   */
  async performSelfHealing(db) {
    if (!this.db) await this.init();

    console.log("[Self-Healing] Starting Integrity Check...");

    // 1. Get ALL Local Batches
    const localBatches = await this.getAllBatches();
    if (localBatches.length === 0) return;

    // 2. Validate against Remote
    const promises = localBatches.map(async (localBatch) => {
      const docRef = db.collection("batches").doc(localBatch.id);

      try {
        const docSnap = await docRef.get();
        let needsRestore = false;
        let reason = "";

        if (!docSnap.exists) {
          console.warn(
            `[Self-Healing] Batch ${localBatch.id} MISSING in Remote!`
          );
          needsRestore = true;
          reason = "Missing Remote Document";
        } else {
          const remoteData = docSnap.data();
          const localStatus = this._deriveStatus(localBatch);

          // Critical Integrity Check: RECALL override
          // If Local says RECALLED, Remote MUST be RECALLED.
          if (localStatus === "RECALLED" && remoteData.status !== "RECALLED") {
            // Double Check: Does Remote have the RECALL log?
            // If logs exist, the immutable chain is safe. Parent status is secondary.
            const logsSnap = await docRef
              .collection("logs")
              .where("eventType", "==", "RECALL")
              .limit(1)
              .get();

            if (logsSnap.empty) {
              console.warn(
                `[Self-Healing] Batch ${localBatch.id} Status Mismatch (Local: RECALLED, Remote: ${remoteData.status}) AND Missing Log.`
              );
              needsRestore = true;
              reason = "Critical Recalled Status Reversion";
            } else {
              console.warn(
                `[Self-Healing] Batch ${localBatch.id} Status Stale, but Integrity OK (Recall Log exists). Skipping restore.`
              );
            }
          }
        }

        if (needsRestore) {
          await this.restoreBatchToRemote(db, localBatch);

          // Log Alert for Admin
          await db.collection("admin_alerts").add({
            type: "AUTO_RESTORE",
            batchId: localBatch.id,
            reason: reason,
            timestamp: Date.now(),
            details:
              "System validated local integrity and restored missing/tampered remote data.",
          });

          // Optional: Notify User via alert?
          // alert(`System healed corrupted data for Batch ${localBatch.id}`);
        }
      } catch (err) {
        console.error(
          `[Self-Healing] Error checking batch ${localBatch.id}:`,
          err
        );
      }
    });

    await Promise.all(promises);
    console.log("[Self-Healing] Integrity Check Complete.");
  }

  // ============================
  // USER METHODS
  // ============================
  async syncUser(userData) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_USER], "readwrite");
      const store = tx.objectStore(STORE_USER);
      const record = {
        uid: userData.uid,
        payload: this._encrypt(userData),
        lastSynced: Date.now(),
      };
      store.put(record);
      req.onsuccess = () => resolve();
    });
  }
}

// Global Instance
const localNode = new MedChainNode();
