# MedChain Supply Tracker �🔗

![Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)
![Blockchain](https://img.shields.io/badge/Blockchain-Hybrid-purple?style=flat-square)
![Stack](https://img.shields.io/badge/Tech-Firebase%20%7C%20Supabase%20%7C%20Leaflet-orange?style=flat-square)

> **A Hybrid Blockchain Supply Chain Management System** designed to track pharmaceutical products from factory to pharmacy with transparency, integrity, and accountability.

---

## 📋 Project Overview

**MedChain** revolutionizes supply chain tracking by combining the speed of modern cloud databases with the immutability of blockchain logic. It ensures that every step of a medicine's journey—from the manufacturing floor to the patient's hands—is verifiable and tamper-evident.

Unlike traditional SQL databases, MedChain imposes **Blockchain-inspired logic** (SHA-256 Hashing, Linked Lists, Genesis Blocks) on top of scalable cloud infrastructure.

---

## 🔥 Unique Features

### 🛡️ Hybrid Blockchain Architecture

Combines the **speed** of centralized databases (Firestore) with the **security** of cryptographic hashing. Fast queries for UI, immutable rigid structure for data.

### 🧠 Self-Healing Local Node

A browser-based "local node" (using IndexedDB) that encrypts and backs up the chain. It acts as a watchdog: if the server data conflicts with the local trusted copy, it **automatically detects tampering** and can restore the correct state.

### 🔐 MetaMask Authentication (Web3)

Integrated Web3 login that uses `personal_sign` challenges. Users don't just "connect" a wallet; they prove identity via cryptographic signatures, replacing insecure passwords.

### 🌍 Geospatial Tracking

Visualizes the physical journey of products using Open Location Codes (Plus Codes). Each handover is stamped with precise location data, verifiable on interactive maps.

### 🤚 Tamper-Evident Linking

Every record (Employment, Shipment, Delivery) is hashed (SHA-256) combined with the _previous_ block's hash. Changing a single character in a past record invalidates the entire subsequent chain.

---

## 💻 Unique Tech Stack & Implementation Logic

Beyond standard web tech, we implemented several advanced mechanisms to create a decentralized-like experience in a Web 2.0 browser environment.

### 1. MetaMask Digital Signatures

**Strategy:** We force the user to **Sign** a distinct message to prove ownership of their private key.

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

  // Request signature from user's crypto wallet
  await window.ethereum.request({
    method: "personal_sign",
    params: [msgHex, userWalletAddress],
  });
}
```

### 2. Browser-Based "Local Node" (Self-Healing)

**Strategy:** The client simulates a node using `IndexedDB` and AES encryption to guard against server-side data corruption.

```javascript
// frontend/assets/scripts/local-node.js
async function performSelfHealing(db) {
  const localBatches = await this.getAllBatches(); // Fetch encrypted local copy

  localBatches.forEach(async (batch) => {
    // Compare Local State (Trusted) vs Remote State (Untrusted)
    if (localStatus === "RECALLED" && remoteData.status !== "RECALLED") {
      console.warn("Tampering Detected! Restoring data from Local Node...");
      await this.restoreBatchToRemote(db, batch);
    }
  });
}
```

### 3. Client-Side SHA-256 Hashing

**Strategy:** Data is verified _before_ it leaves the browser. We strictly reconstruct objects to ensure deterministic hashing (Key Order matters!).

```javascript
// frontend/assets/scripts/verification-utils.js
const orderedData = reconstructVerificationData(block); // Ensure Key Order {a,b} == {a,b}

const recomputedHash = CryptoJS.SHA256(
  block.previousHash + JSON.stringify(orderedData) + block.timestamp
).toString();

if (block.hash !== recomputedHash) {
  throw new Error("Tampering Detected: Hash Mismatch");
}
```

---

## 🛠️ Core Technologies

| Component    | Technology              | Description                                                         |
| :----------- | :---------------------- | :------------------------------------------------------------------ |
| **Frontend** | HTML5, CSS3, Vanilla JS | Lightweight, no-framework architecture for max performance.         |
| **Database** | **Firebase Firestore**  | Scalable NoSQL cloud database storing the "Block" documents.        |
| **Storage**  | **Supabase**            | Decentralized-style object storage for heavy assets (PDFs, Images). |
| **Local DB** | **IndexedDB**           | In-browser persistence for the "Local Node".                        |
| **Crypto**   | **CryptoJS**            | AES Encryption (Local Node) & SHA-256 (Blockchain).                 |
| **Maps**     | **Leaflet.js**          | Open-source interactive maps for supply chain visualization.        |

---

## 👥 Role-Based Workflows

The system enforces strict **Role-Based Access Control (RBAC)**.

1.  **🏭 Manufacturer**: Mints the **Genesis Block**. Generates specific QR codes, uploads production certificates.
2.  **🚚 Distributor**: Scans QR to pickup. Logs handover location and time. Validates "Time Travel" (cannot pickup before production).
3.  **🏥 Pharmacy**: Final scan. Verifies expiry dates and integrity. Confirms "Reception Block".
4.  **🛡️ Admin**: Network oversight. Runs health checks to find broken chains. Can force **Global Recalls**.

---

## 🏗️ Architecture & Flow

We do not use mutable table rows for history. We use **Append-Only Log Entries**.

**Visual Representation:**

```text
/batches/{batchId}
    ├── status: "DELIVERED"
    └── /logs/
         ├── 0: { event: "GENESIS", hash: "abc...", prev: "0" }
         ├── 1: { event: "SHIPMENT", hash: "def...", prev: "abc..." }
         └── 2: { event: "DELIVERED", hash: "ghi...", prev: "def..." }
```

---

## ✅ Pros & Cons

### Advantages

1.  **Instant Finality**: Immediate confirmation (milliseconds) compared to traditional blockchains.
2.  **Resilience**: Local Node backups ensure data survival even if the central server is compromised.
3.  **Auditability**: Full immutable history of every medicine batch is publicly verifiable.

### Disadvantages & Mitigations

1.  **Centralization Risk**: Relies on Google Cloud.
    - _Mitigation_: **Local Node** system ensures users retain their own copy of the data.
2.  **Client-Side Validation**: Malicious users could theoretically modify client code.
    - _Mitigation_: Future updates will move critical verification to **Cloud Functions** (Server-Side) or Smart Contracts.
3.  **Scalability**: Fetching entire chains gets slower with millions of records.
    - _Mitigation_: Implementation of **Pagination** and **Archival Nodes**.

---

## 🔮 Future Roadmap

- [x] **Phase 1: Hardening** (Current) - Basic Logic, Local Node, Geolocation.
- [ ] **Phase 2: Decentralization** - Migrate Verification Logic to Solidity (Polygon Network).
- [ ] **Phase 3: IPFS** - Move file storage from Supabase to IPFS for uncensorable storage.

---

## 📦 Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/Medicine-Chain-Supply-Tracker.git
    ```
2.  **Run Locally**
    - Open `index.html` in a Live Server (VS Code Extension).
    - No `npm install` or build steps required! (Pure Vanilla JS).

---

> Built with ❤️ by the MedChain Team.
