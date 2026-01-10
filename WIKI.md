# Technical Architecture & Implementation Guide

> **Version 1.1.0 (Deep Dive)** | **Last Updated:** 2026-01-10

This document serves as the **definitive technical manual** for MedChain. It goes beyond high-level concepts to explain _exactly_ how the code works, why specific functions exist, and how the security model protects against vectors like database tampering and Man-in-the-Middle attacks.

---

## 1. Core Philosophy: The "Trust-But-Verify" Hybrid Model

MedChain is **not** a traditional decentralized blockchain (like Ethereum). It is a **Cryptographically Verifiable Centralized Ledger**.

- **The Problem:** Traditional blockchains are too slow (finality ~15s) and expensive (gas fees) for high-frequency supply chain tracking. Centralized databases (SQL/NoSQL) are fast but mutable (admins can delete history).
- **The Solution:** Use **Firebase Firestore** for speed, but architect the data as a **Linked List of Hashes**.
  - **Server:** Acts as a dumb storage pipe. It accepts any data.
  - **Client:** Acts as the Validator. It refuses to render or accept any block that doesn't cryptographically link to its predecessor.

---

## 2. Codebase Deep Dive

### 2.1 The "Local Node" (Self-Healing Mechanism)

**File:** `frontend/js/utils/local-node.js`

This is the most critical security feature. It turns every user's browser into a "Light Node" that audits the central server.

#### `performSelfHealing(db)`

This function runs automatically on every page load. It compares the "Untrusted" Remote State (Firestore) with the "Trusted" Local State (IndexedDB).

**Logic Flow:**

1.  **Fetch Local Data:** Retrieve all batches stored in the user's encrypted IndexedDB (`this.getAllBatches()`).
2.  **Fetch Remote Data:** For each local batch, fetch the corresponding document from Firestore.
3.  **Conflict Detection:**
    - **Missing Remote:** If the batch exists locally but not remotely, the server has lost data (or it was maliciously deleted). -> **Trigger Restore**.
    - **Status Regression:** If Local status is `RECALLED` (critical safety state) but Remote status is `DELIVERED`, someone tampered with the database to hide a recall. -> **Trigger Restore**.
4.  **Auto-Restoration:**
    - The client pushes its _entire_ trusted local copy (Logs + Metadata) back to Firestore, overwriting the corrupted state.
    - It logs a `SYSTEM_ALERT` in the `admin_alerts` collection.

```javascript
// Critical Integrity Check Logic
if (localStatus === "RECALLED" && remoteData.status !== "RECALLED") {
  console.warn(`[Self-Healing] Batch ${localBatch.id} Status Mismatch!`);
  // Check if the RECALL log is actually missing from the chain
  const logsSnap = await docRef
    .collection("logs")
    .where("eventType", "==", "RECALL")
    .get();

  if (logsSnap.empty) {
    // The ledger was rewritten to delete the RECALL event.
    // We MUST overwrite the server with our local proof.
    needsRestore = true;
  }
}
```

### 2.2 Deterministic Verification

**File:** `frontend/js/utils/verification-utils.js`

A major challenge in JS-based blockchains is `JSON.stringify()`. In JavaScript, object key order is not guaranteed. `{a:1, b:2}` strings to `"{"a":1,"b":2}"`, but `{b:2, a:1}` strings to `"{"b":2,"a":1}"`. These produce **totally different SHA-256 hashes**.

#### `reconstructVerificationData(block)`

To solve this, we **never** hash the raw `block.data` object directly. We pass it through this reconstruction layer which creates a new object with keys inserted in a strict, hardcoded order.

```javascript
function reconstructVerificationData(block) {
  if (block.eventType === "SHIPMENT") {
    // ENFORCED ORDER: sender -> origin -> receiver -> dest
    return {
      sender: block.data.sender,
      originLocation: block.data.originLocation, // Even if this key was last in original JSON
      receiver: block.data.receiver,
      // ...
    };
  }
}
```

#### `verifyChain(logs)`

This function iterates through an array of log entries (blocks).

- **Time Complexity:** O(N) where N is chain length.
- **Constraint:** `currentBlock.previousHash` MUST equal `previousBlock.hash`.
- **Constraint:** `currentBlock.hash` MUST equal `SHA256(currentBlock.previousHash + JSON.stringify(reconstructedData) + timestamp)`.

If _a single bit_ changes in block #2, the hash check for block #3 will fail. The UI will instantly blank out and show a "TAMPERED" red screen.

---

## 3. Helper Function Analysis

### 3.1 Geolocation Normalization

**File:** `location_utils.js` (Conceptual)

GPS drift is a nightmare for hashing.

- Scan 1: `40.7128, -74.0060`
- Scan 2: `40.7128001, -74.0060002` (User moved 1 inch)
- **Result:** Hash Mismatch! Verification Fails.

**Solution:** **Open Location Codes (Plus Codes)**.
We interpret the GPS coordinates into a grid cell (e.g., `87G8Q2J8+9J`). Any GPS reading _within that 14x14 meter square_ resolves to the **exact same string**. This gives us location proof that is **hash-stable**.

### 3.2 Append-Only Logic

**File:** `frontend/js/utils/block-utils.js`

#### `appendBlock(batchId, block)`

This function is the only gateway to write to the ledger.

- **Concurrency Lock:** It uses the `block.index` as the Document ID.
  - If Block #5 exists, and two users try to write Block #6 at the same exact millisecond?
  - Firestore guarantees that only the _first_ write wins. The second write fails with "Document already exists" because we use `.create()` (or check existence), not `.set()`.
  - This prevents "Forking" the chain.

---

## 4. Architecture Decisions & Trade-offs

### 4.1 Why not Ethereum?

- **Cost:** Storing ~1KB of shipment data on Mainnet costs ~$5-$50 depending on gas.
- **Speed:** Users cannot wait 15 seconds for a transaction confirmation at a loading dock.
- **Privacy:** On Public Ethereum, _everyone_ sees your supply volume. In our Hybrid model, we can use Firestore Security Rules to restrict read access to only authorized parties (e.g., "Only the Distributor assigned to this Batch can view it").

### 4.2 Why Supabase for Storage?

- **Blob Storage:** Blockchains sucks at storing files.
- **The Pattern:**
  1.  File -> Supabase Bucket.
  2.  Supabase -> Returns Signed URL (valid for 1 year).
  3.  Blockchain -> Stores `certificateURL: "https://supa.co/..."`.
- **Implication:** Verification proves _which_ file was uploaded at that time. If the file content on Supabase is swapped, the integrity check won't catch it **unless** we also hashed the file content itself (Potential V2 improvement).

---

## 5. Security Threat Model

### 5.1 The "Rogue Admin" Attack

- **Scenario:** A Database Administrator logs into the Firebase Console and manually changes the `quantity` of a shipment from `100` to `50` to steal the rest.
- **Detection:**
  - The Admin _cannot_ generate a valid hash for the new quantity because they don't have the original timestamps and random nuances of the previous blocks easily available to re-mine the whole chain forward.
  - Even if they re-hash that block, **Block N+1** verification will fail because its `previousHash` pointer still points to the _old_ (now deleted) hash.
  - The chain "snaps" at the point of tampering.

### 5.2 The "Man-in-the-Middle" Attack

- **Scenario:** An attacker intercepts the network request from the Pharmacy.
- **Defense:** We use HTTPS (Transport Layer Security) _plus_ the application-layer signature. The Pharmacy's browser verifies the hash locally. The attacker places a fake block? The browser rejects it because it doesn't fit the mathematical chain.

---

## 6. Role-Based Workflows (Detailed)

### 🏭 Manufacturer

- **File:** `manufacturer-dashboard.js`
- **Constraint:** `if (today < productionDate) throw Error("Time Travel");`
- **Crypto:** Initializes the chain. The specific SHA-256 process involves salting the initial data with a "0" previousHash to signify Genesis.

### 🚚 Distributor

- **File:** `distributor-dashboard.js`
- **Constraint:** Logic checks that `sender === currentUser.uid`.
- **Geo-Fencing:** The code compares the scanned Plus Code with the intended destination. If they don't match, it flags a "Route Deviation" event (though allows the log for audit trail).

### 🏥 Pharmacy

- **File:** `pharmacy-dashboard.js`
- **Constraint:** `expiryDate` check. `if (Date.now() > batch.expiry) alert("Expired Medicine!");`
- **Finality:** Once the `DELIVERED` block is minted, the batch status is locked and cannot be "Undelivered".

---

## 7. API Reference (Internal)

### `localNode` (Singleton)

The global instance of the `MedChainNode` class.

- `init()`: Opens IndexedDB connection.
- `syncBatch(batch)`: Encrypts (AES) and saves a batch.
- `getBatch(id)`: Decrypts and retrieves a batch.
- `performSelfHealing(db)`: The watchdog process.

### `block-utils.js`

- `getLastBlock(batchId)`
  - **Returns:** `Promise<Object>` (The data of the block with highest index).
  - **Throws:** Error if chain is empty (Broken State).

### `auth-utils.js`

- `getEthereum()`
  - **Returns:** `window.ethereum` provider.
  - **Logic:** Includes a retry mechanism (500ms delay) because some mobile wallets inject the provider slightly after page load.
