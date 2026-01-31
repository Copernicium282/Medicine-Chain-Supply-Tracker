# Technical Implementation Notes

Some non-obvious stuff about how this project works.

## MetaMask Authentication

We don't just "connect" the wallet—we make the user sign a message to prove they control the private key.

```javascript
// Hex-encode the message (some mobile wallets need this)
const msg = "Signup request for MedChain Supply Tracker";
const msgHex = "0x" + Array.from(msg).map(c => c.charCodeAt(0).toString(16)).join("");

await window.ethereum.request({
  method: "personal_sign",
  params: [msgHex, walletAddress]
});
```

The signature proves identity. No passwords stored anywhere.

## Self-Healing Local Node

The browser keeps an encrypted backup in IndexedDB. On page load, it compares local state vs server state:

```javascript
async performSelfHealing() {
  const localBatches = await this.getAllBatches();
  
  for (const batch of localBatches) {
    const remoteData = await fetchFromFirestore(batch.id);
    
    // If local says "RECALLED" but server says otherwise, server is wrong
    if (localStatus === "RECALLED" && remoteData.status !== "RECALLED") {
      await this.restoreBatchToRemote(batch);
    }
  }
}
```

The local node uses AES encryption with a device-specific key, so even if someone copies the IndexedDB data, they can't read it without the key.

## Hash Verification

Every block stores:
- Its own hash (SHA-256 of `previousHash + data + timestamp`)
- The previous block's hash

To verify a chain, we re-compute each hash and check the links:

```javascript
for (let i = 1; i < blocks.length; i++) {
  const recomputed = CryptoJS.SHA256(
    blocks[i].previousHash + JSON.stringify(blocks[i].data) + blocks[i].timestamp
  ).toString();
  
  if (blocks[i].hash !== recomputed) throw new Error("Hash mismatch");
  if (blocks[i].previousHash !== blocks[i-1].hash) throw new Error("Chain broken");
}
```

Key gotcha: JSON key order matters. We use a `reconstructVerificationData()` helper to ensure consistent ordering.

## File Storage

PDFs and images go to Supabase, not Firestore. We store signed URLs in the ledger:

```javascript
const { data } = await supabase.storage
  .from("certificates")
  .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year

// Only the URL goes into the immutable log
block.data.certificateURL = data.signedUrl;
```

## Location Tracking

We use Plus Codes instead of raw lat/lng because:
- They're human-readable ("8FPH+3H Bangalore")
- They're consistent (no floating point drift)
- They work offline once encoded

```javascript
const code = OpenLocationCode.encode(latitude, longitude);
// Returns something like "8FPH+3H"
```

## Recall Prevention

When a batch is recalled, we want to prevent any further blocks from being added—even if someone deletes the recall record from Firestore.

The local node checks its own cache first:

```javascript
async function confirmDelivery() {
  await localNode.init();
  
  if (await localNode.isRecalled(batchId)) {
    // Restore the deleted recall record
    await localNode.restoreBatchToRemote(db, cachedBatch.data);
    alert("Batch is recalled. Cannot proceed.");
    return;
  }
  
  // ... proceed with delivery
}
```

This way, even if the server is compromised, the local node acts as a last line of defense.
