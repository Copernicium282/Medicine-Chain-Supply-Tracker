# MedChain Supply Tracker 💊🔗

A blockchain-based pharmaceutical supply chain tracking system designed to prevent counterfeiting and ensure medicine authenticity from factory to pharmacy.

## 🌟 Unique Features

### 1. **Client-Side "Local Node" Simulation**

Unlike standard dApps that rely entirely on RPC calls, this project implements a **Local Blockchain Node** in JavaScript (`local-node.js`).

- **Self-Healing Chain**: The client independently fetches the chain, verifies every single block hash locally, and identifies tampered blocks.
- **Independent Verification**: Does not trust the server blindly. If the database is compromised, the client detects the hash mismatch immediately.

### 2. **Hybrid "Dual-Storage" Architecture**

We utilize a hybrid approach for speed and security:

- **Firestore (World State)**: Stores the current state (e.g., "In Transit", "Delivered") for millisecond-latency queries and UI reactivity.
- **Immutable Ledger (Chain)**: Stores the actual linked-list of blocks (`genesis` -> `shipment` -> `delivery`). This is the "Source of Truth".
- **Supabase Storage**: Decentralized-like storage for heavy assets like Production Certificates and Shipment Evidence, linked cryptographically to the chain.

### 3. **Role-Based Access Control (RBAC)**

Strict permissioning ensures only authorized entities can append to the chain:

- **Manufacturer**: Can mint Genesis Blocks.
- **Distributor**: Can sign Shipment Blocks.
- **Pharmacy**: Can sign Reception Blocks.
- **Consumer/Admin**: Read-only access for verification.

---

## 🛠 Features & Functions

### 🏭 Manufacturer Dashboard

- **Create Batch (`createBatch`)**: Mints the _Genesis Block_ (Index 0).
  - Hashing: `SHA256(timestamp + data + previousHash="0")`
  - Linking: Uploads certificate to Supabase, generates public URL, and embeds in block.
- **QR Code Generation**: Auto-generates a specific QR code pointing to the verification page with the Batch ID.

### 🚚 Distributor Dashboard

- **Shipment Tracking (`createShipmentUpdate`)**: Appends a _Shipment Block_.
  - **GPS Integration**: Captures real-time GPS coords or Plus Codes of the handover location.
  - **Chain Integrity**: Links to the Manufacturer's hash.

### 🏥 Pharmacy Dashboard

- **Receive Delivery (`confirmDelivery`)**: Appends a _Reception Block_.
  - **Condition Check**: logs notes on medicine condition.
  - **Ownership Transfer**: Finalizes the chain for the consumer.

### 🔍 Verification Portal (Public)

- **Instant Audit**: Consumers scan the QR code to see the full journey.
- **Red/Green Indicators**:
  - 🟢 **Valid**: All hashes match, chain is unbroken.
  - 🔴 **Invalid**: A hash mismatch was detected (potential tampering).

### 🛡️ Admin Dashboard

- **Network Health Check**: Iterates through all batches to check for "Broken Chains".
- **Recall Management**: Can flag batches as "Recalled", which instantly alerts all nodes (Pharmacists/Consumers).

---

## ⚠️ Disadvantages & Mitigations

| Disadvantage                     | Risk                                                             | Mitigation Implemented                                                                                                                                                                                                                                 |
| :------------------------------- | :--------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Centralized Database**         | A DB admin (Firebase) could theoretically delete or modify data. | **Client-Side Hashing & Local Node**: Even if data is changed on the server, the hash of the block will no longer match the data. The client (`verify.html`) will flag this as **INVALID** immediately. The server cannot fake the digital signatures. |
| **Private Keys Keys in Browser** | User keys (if local) can be stolen by XSS.                       | **Session/Local Storage Isolation**: We use `sessionStorage` for short-term sessions. Ideally, this would integrate with a hardware wallet or MetaMask (supported in code) for signing transactions.                                                   |
| **Scalability**                  | Storing all blocks in Firestore documents can get expensive.     | **Sharding & Archiving**: The system currently limits queries to active batches. Old batches can be archived to cold storage (IPFS/Filecoin) while keeping only the Root Hash on active chain.                                                         |

---

## 🚀 Tech Stack

- **Frontend**: HTML5, Raw CSS (Teal/Dark Mode Theme), Vanilla JS
- **Crypto Engine**: `crypto-js` (SHA256), `qrcode.js`
- **Backend/DB**: Firebase Firestore (NoSQL), Supabase (Storage)
- **Auth**: Firebase Auth + Custom Role Logic

## 📦 Installation

1. Clone the repo.
2. Open `index.html` in a Live Server.
3. No build steps required (Pure Vanilla JS).
