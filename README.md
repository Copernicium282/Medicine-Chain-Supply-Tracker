# MedChain Supply Tracker �🔗

![Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)
![Blockchain](https://img.shields.io/badge/Blockchain-Hybrid-purple?style=flat-square)
![Stack](https://img.shields.io/badge/Tech-Firebase%20%7C%20Supabase%20%7C%20Leaflet-orange?style=flat-square)

> **A Blockchain-Inspired Supply Chain Tracker** that uses cryptographic linking to ensure pharmaceutical integrity from factory to pharmacy.

---

## 📋 Project Overview

**MedChain** revolutionizes supply chain tracking by implementing **Blockchain-inspired logic** (SHA-256 Hashing, Linked Lists, Merkle-like Verification) on top of a standard cloud infrastructure.

It provides the **transparency and tamper-evidence** of a blockchain without the high gas fees or slow transaction times of a decentralized network.

> **Note:** This project demonstrates how blockchain _concepts_ can secure a centralized system.

---

## 🔥 Unique Features

### 🛡️ Hybrid Cryptographic Architecture

Combines the **speed** of centralized databases (Firestore) with the **security** of cryptographic hashing (`SHA-256`). I used a **Cryptographically Linked Ledger** structure where every record acts as a "block" that verifies its predecessor.

### 🧠 Self-Healing Local Node

A browser-based "local node" (using IndexedDB) that encrypts and backs up the chain. It acts as a watchdog: if the server data conflicts with the local trusted copy, it **automatically detects tampering** and can restore the correct state.

### 🔐 MetaMask Authentication (Web3)

Integrated Web3 login that uses `personal_sign` challenges. Users don't just "connect" a wallet; they prove identity via cryptographic signatures, replacing insecure passwords.

### 🌍 Geospatial Tracking

Visualizes the physical journey of products using Open Location Codes (Plus Codes). Each handover is stamped with precise location data, verifiable on interactive maps.

### 🤚 Tamper-Evident Linking

Every record (Employment, Shipment, Delivery) is hashed (SHA-256) combined with the _previous_ block's hash. Changing a single character in a past record invalidates the entire subsequent chain.

---

## 🛠️ Core Technologies

| Component    | Technology              | Description                                                         |
| :----------- | :---------------------- | :------------------------------------------------------------------ |
| **Frontend** | HTML5, CSS3, Vanilla JS | Lightweight, no-framework architecture for max performance.         |
| **Database** | **Firebase Firestore**  | Scalable NoSQL cloud database storing the "Block" documents.        |
| **Storage**  | **Supabase**            | Decentralized-style object storage for heavy assets (PDFs, Images). |
| **Local DB** | **IndexedDB**           | In-browser persistence for the "Local Node".                        |
| **Crypto**   | **CryptoJS**            | AES Encryption (Local Node) & SHA-256 (Ledger Linking).             |
| **Maps**     | **Leaflet.js**          | Open-source interactive maps for supply chain visualization.        |
| **SDKs**     | **External Libs**       | `Chart.js`, `QRCode.js`, `Google Fonts`, `Firebase/Supabase SDKs`.  |

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

## 💻 Unique Tech Stack & Implementation Logic

Beyond standard web tech, I implemented advanced mechanisms like **MetaMask Signals**, **Self-Healing Local Nodes**, and **Client-Side Hashing**.

> 📘 **Developers:** For detailed implementation logic and code snippets, please see the [Technical Architecture Wiki](WIKI.md).

---

## 👥 Role-Based Workflows

The system enforces strict **Role-Based Access Control (RBAC)**.

1.  **🏭 Manufacturer**: Mints the **Genesis Block**. Generates specific QR codes, uploads production certificates.
2.  **🚚 Distributor**: Scans QR to pickup. Logs handover location and time. Validates "Time Travel" (cannot pickup before production).
3.  **🏥 Pharmacy**: Final scan. Verifies expiry dates and integrity. Confirms "Reception Block".
4.  **🛡️ Admin**: Network oversight. Runs health checks to find broken chains. Can force **Global Recalls**.

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

## 🌟 Credits & Acknowledgments

### Tools & APIs

- **Firebase Firestore**: For the scalable, real-time database.
- **Supabase Storage**: For securely hosting evidence files off-chain.
- **Leaflet.js**: For the interactive, privacy-friendly maps.
- **Google Open Location Codes**: For the immutable "Plus Code" geolocation system.
- **Chart.js**: For the real-time analytics visualization.

### Special Thanks

- **Antigravity (AI Assistant)**: Served as the primary **CSS-Helper and Debugger**, fixing layout issues and resolving complex JavaScript logic errors during development. 🤖✨
