# MedChain Supply Tracker

A blockchain-inspired supply chain tracker for pharmaceuticals. Uses cryptographic linking (SHA-256) to maintain tamper-evident records from factory to pharmacy.

> This isn't a real blockchain—it's blockchain *concepts* applied to a centralized stack. You get the security benefits without the gas fees.

## What It Does

- **Creates immutable audit trails** for medicine batches using hash-linked records
- **Detects tampering** by verifying the entire chain on each lookup
- **Tracks location** at every handover using Plus Codes
- **Supports MetaMask login** via `personal_sign` challenges
- **Self-heals** using a browser-based backup (IndexedDB) that can restore corrupted server data

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla JS, HTML5, CSS3 |
| Database | Firebase Firestore |
| File Storage | Supabase |
| Local Cache | IndexedDB + AES encryption |
| Crypto | CryptoJS (SHA-256, AES) |
| Maps | Leaflet.js |
| Charts | Chart.js |

## How It Works

Every action (production, shipment, delivery) creates a "block" that references the previous block's hash:

```
/batches/{batchId}/logs/
├── 0: { event: "GENESIS", hash: "abc...", previousHash: "0" }
├── 1: { event: "SHIPMENT", hash: "def...", previousHash: "abc..." }
└── 2: { event: "DELIVERED", hash: "ghi...", previousHash: "def..." }
```

If someone modifies block 0, the hash changes. Block 1's `previousHash` no longer matches. Chain broken. Tampering detected.

## User Roles

- **Manufacturer** — Creates batches with genesis blocks, generates QR codes
- **Distributor** — Logs shipment pickups and handovers
- **Pharmacy** — Confirms final delivery
- **Admin** — Runs health checks, issues recalls

## The "Local Node" Thing

Each browser keeps an encrypted copy of batch data in IndexedDB. If the server data gets corrupted (or someone deletes records), the local node can detect the mismatch and push the correct data back.

It's not true decentralization, but it's a decent fallback for a centralized system.

## Known Limitations

1. **Centralized infrastructure** — Still depends on Firebase/Google Cloud
2. **Client-side validation** — Sophisticated attackers could bypass checks (future: move to Cloud Functions)
3. **Scale** — Fetching full chains gets slow with millions of records

## Running Locally

```bash
git clone https://github.com/yourusername/Medicine-Chain-Supply-Tracker.git
cd Medicine-Chain-Supply-Tracker/frontend
# Open index.html with VS Code Live Server or any static server
```

No npm, no build step. It's vanilla JS.

## Future Plans

- Move verification logic to Solidity (Polygon)
- Migrate file storage to IPFS
- Add server-side validation via Cloud Functions

## Technical Deep Dive

See [WIKI.md](WIKI.md) for implementation details on MetaMask signatures, the self-healing mechanism, and hash verification.

---

MIT License
