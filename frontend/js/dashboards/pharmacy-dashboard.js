// Check access
requireAccess("pharmacy");

console.log("Pharmacy dashboard loaded.");

// Helper: Upload to Supabase for receipt
async function uploadFileToSupabase(file) {
  if (!file) return null;
  try {
    const filePath = `receipts/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("certificates")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: signedData, error: signedError } = await supabase.storage
      .from("certificates")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 Year

    if (signedError) throw signedError;
    return signedData.signedUrl;
  } catch (e) {
    console.error("Upload failed:", e);
    throw new Error("File upload failed: " + e.message);
  }
}

// Init
document.addEventListener("DOMContentLoaded", async () => {
  // Show User Info
  const userInfoDiv = document.getElementById("userInfo");
  if (userInfoDiv) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        userInfoDiv.textContent = `User: ${user.email}`;
      } else {
        const metaUser = localStorage.getItem("metamask_wallet");
        if (metaUser) {
          userInfoDiv.textContent = `Wallet: ${metaUser.substring(
            0,
            6
          )}...${metaUser.substring(38)}`;
        } else {
          userInfoDiv.textContent = "Unknown User / Guest";
        }
      }
    });
  }

  // Location Button
  const btnGetLoc = document.getElementById("btnGetLoc");
  if (btnGetLoc) {
    btnGetLoc.addEventListener("click", async () => {
      try {
        btnGetLoc.innerText = "⏳";
        const code = await getDeviceLocationAsPlusCode();
        document.getElementById("location").value = code;
        btnGetLoc.innerText = "📍";
      } catch (e) {
        alert(e);
        btnGetLoc.innerText = "📍";
      }
    });
  }
});

// Load Batch
async function loadBatchForDelivery() {
  const batchId = document.getElementById("batchId").value.trim();
  if (!batchId) return alert("Enter Batch ID");

  try {
    const lastBlock = await getLastBlock(batchId);
    alert(
      `Batch Loaded!\nCurrent Status: ${lastBlock.eventType}\nIndex: ${lastBlock.index}`
    );
  } catch (e) {
    alert("Batch not found or empty: " + e.message);
  }
}

// Confirm Delivery
/**
 * Validates delivery inputs.
 *
 * @param {Object} inputs - UI inputs.
 * @param {Object} lastBlock - Previous Shipment block.
 * @returns {Promise<string|null>} Error or null.
 */
async function validateDeliveryInputs(inputs, lastBlock) {
  const { batchId, location, deliveryTimeInput } = inputs;

  if (!batchId || !location) return "Please enter Batch ID and Location.";

  // Async Location Check
  if (!(await validateAddress(location)))
    return "Invalid Location! Please use a valid Plus Code from https://plus.codes/map";

  if (!lastBlock) return "Batch not loaded or invalid.";

  // Logic: Location Match
  // Verification: The Pharmacy confirming receipt MUST be at the location specified by the Distributor.
  // This prevents "Ghost Deliveries" where goods are marked delivered but never arrived at the target.
  if (
    lastBlock.data &&
    lastBlock.data.destLocation &&
    location !== lastBlock.data.destLocation
  ) {
    return `Location Mismatch!\nYour location does not match the Destination specified by the Distributor.\nExpected: ${lastBlock.data.destLocation}\nProvided: ${location}`;
  }

  // Logic: Time Checks
  const systemTime = new Date().toISOString();
  const effectiveDeliveryTime = deliveryTimeInput
    ? new Date(deliveryTimeInput).toISOString()
    : systemTime;
  const prevBlockTime = new Date(lastBlock.timestamp);
  const currentDeliveryTime = new Date(effectiveDeliveryTime);

  if (currentDeliveryTime < prevBlockTime) {
    return `Invalid Date: Delivery time (${currentDeliveryTime.toLocaleString()}) cannot be before the previous event (${
      lastBlock.eventType
    }).`;
  }

  return null;
}

async function confirmDelivery() {
  const batchId = document.getElementById("batchId").value.trim();
  const location = document.getElementById("location").value.trim();
  const deliveryTimeInput = document.getElementById("deliveryTime").value;
  const notes = document.getElementById("notes").value.trim();
  const fileInput = document.getElementById("evidenceFile");

  const btn = document.getElementById("deliveryBtn");
  const statusDiv = document.getElementById("deliveryStatus");

  // 1. Fetch Data First (Needed for validation)
  let lastBlock;
  try {
    if (!batchId) throw new Error("Batch ID required");
    lastBlock = await getLastBlock(batchId);
  } catch (e) {
    if (batchId) alert("Batch ID not found.");
    else alert("Please enter Batch ID and Location.");
    return;
  }

  // 2. Validate
  statusDiv.textContent = "Validating...";
  const inputs = { batchId, location, deliveryTimeInput };
  const errorMsg = await validateDeliveryInputs(inputs, lastBlock);

  if (errorMsg) {
    statusDiv.textContent = "";
    alert(errorMsg);
    if (errorMsg.includes("plus.codes"))
      window.open("https://plus.codes/map", "_blank");
    return;
  }

  // 3. Lock UI & Proceed
  btn.disabled = true;
  statusDiv.textContent = "Processing...";
  statusDiv.style.color = "blue";

  try {
    // Upload File
    let proofURL = "";
    if (fileInput.files.length > 0) {
      statusDiv.textContent = "Uploading proof...";
      proofURL = await uploadFileToSupabase(fileInput.files[0]);
    }

    // (Data already fetched and validated)

    const newIndex = lastBlock.index + 1;
    const previousHash = lastBlock.hash;

    // Time logic
    const systemTime = new Date().toISOString();
    const effectiveDeliveryTime = deliveryTimeInput
      ? new Date(deliveryTimeInput).toISOString()
      : systemTime;

    // (Time check done in validation)

    const data = {
      pharmacyLocation: location,
      notes: notes,
      confirmedAt: effectiveDeliveryTime,
      proofURL: proofURL,
    };

    const hash = CryptoJS.SHA256(
      previousHash + JSON.stringify(data) + systemTime
    ).toString();

    // User Identity
    const createdBy =
      auth.currentUser?.uid ||
      localStorage.getItem("metamask_wallet") ||
      sessionStorage.getItem("metamask_user");

    if (!createdBy) throw new Error("User identity missing");

    // Expiry Check
    try {
      const genesisSnap = await db
        .collection("batches")
        .doc(batchId)
        .collection("logs")
        .doc("0")
        .get();
      if (genesisSnap.exists) {
        const genesisData = genesisSnap.data();
        if (genesisData.data && genesisData.data.expiryDate) {
          const expDate = new Date(genesisData.data.expiryDate);
          const actionTime = new Date(effectiveDeliveryTime);

          if (actionTime > expDate) {
            console.warn("EXPIRY VIOLATION DETECTED");
            // Alert Admin
            await db.collection("admin_alerts").add({
              type: "EXPIRY_VIOLATION",
              batchId: batchId,
              timestamp: Date.now(),
              details: `Pharmacy confirmed delivery AFTER expiry date.`,
              reason: `Action at ${actionTime.toLocaleString()} > Expiry ${expDate.toLocaleString()}`,
            });
            alert(
              "⚠️ NOTICE: This batch has expired. The delivery will be recorded, but an alert has been sent to the Admin."
            );
          }
        }
      }
    } catch (expErr) {
      console.warn("Expiry check failed (non-blocking):", expErr);
    }

    // Construct Block
    const newBlock = {
      batchId,
      index: newIndex,
      eventType: "DELIVERY_CONFIRMATION",
      role: "pharmacy",
      data,
      timestamp: systemTime, // Block Record Time
      previousHash,
      hash,
      createdBy,
    };

    // Append Block
    statusDiv.textContent = "Appending to blockchain...";
    await appendBlock(batchId, newBlock);

    // Update parent status
    try {
      await db
        .collection("batches")
        .doc(batchId)
        .update({ status: "DELIVERED" });
    } catch (e) {
      console.warn("Parent status update failed:", e);
    }

    // Success
    statusDiv.innerHTML = `✅ Delivery Confirmed! Block #${newIndex} appended.<br>Hash: ${hash.substring(
      0,
      15
    )}...`;
    statusDiv.style.color = "green";
    alert("Delivery Confirmed Successfully!");
  } catch (e) {
    console.error(e);
    statusDiv.textContent = "❌ Delivery Confirmation Failed: " + e.message;
    statusDiv.style.color = "red";
    alert("Error: " + e.message);
  } finally {
    btn.disabled = false;
  }
}
