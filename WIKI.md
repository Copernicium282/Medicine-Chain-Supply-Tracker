# Technical Architecture & Implementation Guide

> **Version 1.0.0** | **Last Updated:** 2026-01-10
> This document details the specific implementation logic, code patterns, and security mechanisms used in MedChain. It is intended for developers, auditors, and system architects.

---

## 1. Introduction

MedChain is a **Hybrid Supply Chain Management System** that bridges the gap between Web 2.0 efficiency and Web 3.0 security. It was designed to solve the problem of _Counterfeit Medicine_ in developing markets where connectivity is intermittent and full decentralization is cost-prohibitive.

The core philosophy is **"Trust but Verify"**. We use centralized cloud infrastructure for performance (Google Cloud/Firestore) but enforce strict cryptographic linking on the client-side to ensure that the central authority (User/Server) cannot silently tamper with the history.

---

## 2. Core Architecture

### 2.1 The Hybrid Model

Unlike Ethereum or Hyperledger, MedChain does not rely on a Peer-to-Peer network of consensus nodes. Instead, it uses a **Client-Verifiable Ledger**.

- **Storage Layer:** Firebase Firestore (NoSQL Documents).
- **Verification Layer:** Client-Side JavaScript (CryptoJS).
- **Consensus Mechanism:** **"Proof of Previous Hash"**. A new entry is only valid if its `previousHash` field matches the SHA-256 hash of the immediately preceding block.

### 2.2 The "Local Node" Concept

The most unique feature of MedChain is the browser-based Local Node.

- **Technology:** `IndexedDB` (Native Browser Database).
- **Function:** Every time a user interacts with the system, their browser silently downloads the relevant blockchain data and encrypts it using AES (Advanced Encryption Standard) before storing it locally.
- **Self-Healing:** On startup, the system compares the Server State (Remote) with the Local State (Trusted). If the server returns a "clean" history but the local node has a "recalled" or "different" history, the system flags a **TAMPERING ALERT** and attempts to overwrite the server with the trusted local copy.

---

## 3. detailed Feature Breakdown

### 3.1 MetaMask Digital Signatures

We strictly avoid storing passwords. Authentication is handled purely via cryptographic challenges.

**Workflow:**

1.  User clicks "Login with MetaMask".
2.  Frontend generates a random `nonce` or static challenge string properly Hex-Encoded.
3.  MetaMask prompts the user to **Sign** this message using their Private Key (Secp256k1).
4.  The backend (or auth verification function) recovers the Public Address from the signature.
5.  If `Recovered Address == User Address`, access is granted.

```javascript
// frontend/js/auth/metamask-signup.js
async function signupWithMetamask() {
  const msg = "Signup request for MedChain Supply Tracker";
  // Hex Encode (Crucial for correct personal_sign behavior)
  const msgHex =
    "0x" +
    Array.from(msg)
      .map((c) => c.charCodeAt(0).toString(16))
      .join("");

  await window.ethereum.request({
    method: "personal_sign",
    params: [msgHex, userWalletAddress],
  });
}
```

### 3.2 Geolocation via Plus Codes

GPS coordinates (`lat/lng`) are float values that can drift due to sensor noise (e.g., `12.999991` vs `12.999992`). This breaks hashing consistency.
We solve this by converting coordinates into **Open Location Codes (Plus Codes)**, which are distinct, grid-based alphanumeric strings (e.g., `8F29+59 New York`). This ensures that a location scan is always deterministic.

```javascript
// frontend/js/utils/location_utils.js
const code = OpenLocationCode.encode(latitude, longitude); // Returns "8F29+59"
```

### 3.3 Supabase Evidence Locker

Storing binary data (images, PDFs) on a blockchain is inefficient ("Blockchain Bloat").
**Solution:**

1.  Upload file to **Supabase Storage** (AWS S3-compatible).
2.  Generate a time-limited **Signed URL**.
3.  Store _only_ the Signed URL string in the blockchain block.
4.  This keeps the ledger lightweight while retaining proof of physical evidence.

---

## 4. Role-Based Workflows (RBAC)

The logic is predominantly handled in the frontend dashboard scripts, enforcing permissions via checking the user's role against the Firestore `users` collection.

### 🏭 Manufacturer

- **Responsibilities:** Initialize the Supply Chain.
- **Key Action:** Mint `GENESIS` Block.
- **Constraint:** Cannot create a batch with a past date.
- **Code Flow:**
  - Input: Name, Qty, Expiry.
  - Process: `SHA256("0" + Data + Timestamp)` -> `Hash`.
  - Output: Write to `/batches/{id}/logs/0`.

### 🚚 Distributor

- **Responsibilities:** Transport custody.
- **Key Action:** Append `SHIPMENT` Block.
- **Constraint:** Logical Check - "Time Travel". A distributor cannot log a shipment `departureTime` that is _before_ the manufacturer's `productionDate`.
- **Code Flow:**
  - Fetch `LastBlock`.
  - Verify `LastBlock.hash`.
  - Link new block: `previousHash = LastBlock.hash`.

### 🏥 Pharmacy

- **Responsibilities:** Final Verification.
- **Key Action:** Append `DELIVERED` Block.
- **Constraint:** If `Today > ExpiryDate`, the system warns the user but allows the log (immutability).
- **Code Flow:**
  - Scans QR Code.
  - System runs `verifyChain()` automatically.
  - If Valid -> Accept Delivery.

### 🛡️ Admin

- **Responsibilities:** Network Health.
- **Key Action:** `runHealthCheck()`.
- **Mechanism:**
  - Iterates through _all_ batches in Firestore.
  - Recomputes hashes for every block `i` and compares with stored `hash`.
  - Checks if `block[i].previousHash === block[i-1].hash`.
  - If mismatch -> Marks Batch as `COMPROMISED`.

---

## 5. Security Analysis

### 5.1 Threat Model

- **Attacker:** Malicious Insider (e.g., Database Admin).
- **Attack:** Directly editing a Firestore document to change a shipment location.
- **Defense:**
  1.  **Hash Mismatch:** The next time any client loads that batch, the client-side `verifyChain()` function will calculate that the modified data results in a different hash than the one stored in the _next_ block's `previousHash`. The chain will break visually.
  2.  **Local Node Conflict:** If the Manufacturer loads the page, their Local Node (IndexedDB) will see the change, detect the conflict with its encrypted local history, and alert the user.

### 5.2 Client-Side Trust

- **Risk:** An attacker modifies the JavaScript code in their own browser to bypass checks.
- **Mitigation:** This only corrupts _their_ view or their write. It does not corrupt the actual consensus validation performed by other honest nodes (e.g., the Pharmacy receiving the drug). The Pharmacy's code will simply reject the malformed block sent by the malicious Distributor.

---

## 6. Disadvantages & Mitigations

### 🔴 1. Centralized Storage Point

**Issue:** The "Ledger" lives on Google's Firestore. If Google deletes the database, the data is lost.
**Mitigation:** The **Local Node** system acts as a distributed backup. Every user (Manufacturer, Distributor, Pharmacy) carries a shard of the database. Theoretically, the entire chain could be reconstructed from these local IndexedDB instances.

### 🔴 2. Lack of Smart Contracts

**Issue:** Logic is executed in JavaScript, not a decentralized EVM. We cannot "force" a rule (e.g., stopping a shipment) if the user simply bypasses the UI and uses the API directly.
**Mitigation:** We implement **Cloud Functions** (Server-Side) that double-check the logic. For example, a Firestore Rule can prevent writing a block if the `previousHash` doesn't match the existing doc's hash (Optimistic Concurrency Control).

### 🔴 3. Scalability of Verification

**Issue:** To verify block #100, we currently fetch and hash blocks #0 to #99. This is `O(n)`.
**Mitigation:** We can implement **Checkpoints**. Every 50 blocks, the Admin signs a "Merkle Root" of the state. Clients then only need to verify from the last trusted Checkpoint.

---

## 7. Data Models

### Block Structure (JSON)

```json
{
  "index": 1,
  "eventType": "SHIPMENT",
  "data": {
    "location": "8F29+59 New York",
    "handler": "Distributor_User_123",
    "temperature": "22C"
  },
  "timestamp": "2026-01-10T12:00:00Z",
  "previousHash": "a1b2c3d4...",
  "hash": "e5f6g7h8..."
}
```

### User Profile (RBAC)

```json
{
  "uid": "user_xyz",
  "role": "manufacturer",
  "walletAddress": "0x123..."
}
```

---

## 8. API Reference

### `appendBlock(batchId, blockData)`

> Core function to write to the ledger.

- **Inputs:** `batchId` (String), `blockData` (Object)
- **Returns:** `Promise<void>`
- **Logic:**
  1.  Fetches lock on batch.
  2.  Validates `blockData.previousHash`.
  3.  Writes to Firestore subcollection `logs`.
  4.  Updates parent `status`.

### `verifyChain(batchId)`

> Runs the integrity check.

- **Returns:** `Boolean` (True = Valid, False = Tampered)

---

> _© 2026 MedChain Internals_
