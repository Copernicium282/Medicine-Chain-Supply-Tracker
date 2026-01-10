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

### 4. Supabase "Off-Chain" Evidence Locker

**Strategy:** Ledgers shouldn't store PDFs. We upload files to Supabase and only store the **Signed URL** in the immutable log.

```javascript
// ManufacturerDashboard.js
const { data, error } = await supabase.storage
  .from("certificates")
  .upload(filePath, file);

const { data: signedData } = await supabase.storage
  .from("certificates")
  .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 Year Validity

const certificateURL = signedData.signedUrl; // This string goes to the Immutable Ledger
```

### 5. Geolocation via Plus Codes

**Strategy:** We convert raw GPS coordinates (which drift) into **Open Location Codes** (Plus Codes) for human-readable, consistent location tags.

```javascript
// location_utils.js
async function getDeviceLocationAsPlusCode() {
  const position = await getCurrentPosition(); // Browser API
  const { latitude, longitude } = position.coords;

  // Convert standard Lat/Lng to "8F29+59 New York"
  const code = OpenLocationCode.encode(latitude, longitude);
  return code;
}
```
