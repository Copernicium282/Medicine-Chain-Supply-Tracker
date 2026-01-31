// Check access
requireAccess("distributor");

console.log("Distributor dashboard loaded.");

let loadedLastBlock = null;

// Load batch data
async function loadBatchForShipment() {
  const batchId = document.getElementById("batchId").value.trim();
  const status = document.getElementById("shipmentStatus");

  if (!batchId) {
    alert("Please enter a Batch ID.");
    return;
  }

  status.style.color = "blue";
  status.innerText = "Loading batch data...";

  try {
    const lastBlock = await getLastBlock(batchId);

    // Verify state is GENESIS
    if (lastBlock.index !== 0 || lastBlock.eventType !== "GENESIS") {
      throw new Error("Batch is not in GENESIS state. Shipment not allowed.");
    }

    loadedLastBlock = lastBlock;

    status.style.color = "green";
    status.innerText = "Batch Loaded Successfully.";
    alert(`Batch Loaded!\nLast event: GENESIS\nIndex: ${lastBlock.index}`);
  } catch (err) {
    loadedLastBlock = null;
    status.style.color = "red";
    status.innerText = err.message;
  }
}

// Create Shipment
/**
 * Validates shipment inputs.
 * Returns error string or null if valid.
 */
/**
 * Validates all shipment inputs against logical constraints.
 *
 * @param {Object} inputs - The raw input values.
 * @param {Object} lastBlock - The previous block in the chain (Genesis).
 * @returns {Promise<string|null>} Returns error message string or null if valid.
 */
async function validateShipmentInputs(inputs, lastBlock) {
  const {
    batchId,
    sender,
    originLocation,
    destLocation,
    shipmentQty,
    departureTime,
    file,
  } = inputs;

  if (!lastBlock) return "Load batch details before creating shipment.";
  // Basic existence checks are done pre-call or here?
  // Let's do them here to be self-contained.
  if (
    !batchId ||
    !sender ||
    !originLocation ||
    !destLocation ||
    !shipmentQty ||
    !departureTime ||
    !file
  ) {
    return "Please fill all fields and upload evidence.";
  }

  // Type checks
  const qty = Number(shipmentQty);
  if (!Number.isInteger(qty) || qty <= 0)
    return "Shipment quantity must be a positive integer.";

  // Logical Time Check
  // We must ensure causality: a shipment cannot leave before the batch was produced.
  if (new Date(departureTime) < new Date(lastBlock.timestamp)) {
    return "Invalid Date: Departure time cannot be before the production timestamp.";
  }

  // Logical Location Check
  // Supply Chain Continuity: The shipment must originate from where the goods currently are (Factory).
  if (
    lastBlock.data.factoryLocation &&
    originLocation !== lastBlock.data.factoryLocation
  ) {
    return `Location Error: Origin must match Factory Location exactly.\nExpected: ${lastBlock.data.factoryLocation}`;
  }

  // Verify Locations (Async)
  if (!(await validateAddress(originLocation)))
    return `Origin Location '${originLocation}' verification failed.\nPlease use a valid Plus Code.`;
  if (!(await validateAddress(destLocation)))
    return `Destination Location '${destLocation}' verification failed.\nPlease use a valid Plus Code.`;

  // File Validation
  const maxSize = 50 * 1024 * 1024;
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (!allowed.includes(file.type)) return "Unsupported file type.";
  if (file.size > maxSize) return "File too large (max 50MB).";

  return null; // Valid
}

/**
 * Main Controller
 */
async function createShipmentUpdate() {
  const batchId = document.getElementById("batchId").value.trim();
  const file = document.getElementById("evidenceFile").files[0];
  // ... gather others ...

  // Pre-validation
  const inputs = {
    batchId,
    sender: document.getElementById("sender").value.trim(),
    originLocation: document.getElementById("originLocation").value.trim(),
    receiver: document.getElementById("receiver").value.trim(),
    destLocation: document.getElementById("destLocation").value.trim(),
    shipmentQty: document.getElementById("shipmentQty").value.trim(),
    departureTime: document.getElementById("departureTime").value,
    file,
  };

  const status = document.getElementById("shipmentStatus");
  status.innerText = "Validating...";

  if (!loadedLastBlock) {
    alert("Load batch first.");
    return;
  }

  // Extracted Validation Call
  const errorMsg = await validateShipmentInputs(inputs, loadedLastBlock);
  if (errorMsg) {
    status.innerText = "";
    alert(errorMsg);
    return;
  }

  // Check local node for recalled status
  await localNode.init();
  if (await localNode.isRecalled(batchId)) {
    const cachedBatch = await localNode.getBatch(batchId);
    await localNode.restoreBatchToRemote(db, cachedBatch.data);
    status.style.color = "red";
    status.innerText = "⛔ Batch is RECALLED. Data restored.";
    alert("⛔ BLOCKED: This batch has been RECALLED and cannot be modified.");
    return;
  }

  const qty = Number(inputs.shipmentQty);
  // ... logic continues ...

  // ... continued logic ...

  try {
    // Quantity check
    const manufacturedQty = Number(loadedLastBlock.data.quantity);
    if (qty !== manufacturedQty) {
      throw new Error(`Quantity mismatch. Manufactured: ${manufacturedQty}`);
    }

    // Upload evidence
    status.innerText = "Uploading shipment evidence...";

    const filePath = `shipments/${batchId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("shipments")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: signedData, error: signedError } = await supabase.storage
      .from("shipments")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (signedError) throw signedError;

    const evidenceURL = signedData.signedUrl;

    // Get User ID
    const createdBy =
      auth.currentUser?.uid || localStorage.getItem("metamask_wallet");

    if (!createdBy) {
      throw new Error("Unable to determine distributor identity.");
    }

    // Check for expiry (Alert Admin)
    try {
      // Check if batch is already expired
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
          const now = new Date(departureTime);

          if (now > expDate) {
            console.warn("EXPIRY VIOLATION DETECTED");
            // Notify Admin
            await db.collection("admin_alerts").add({
              type: "EXPIRY_VIOLATION",
              batchId: batchId,
              timestamp: Date.now(),
              details: `Distributor shipped batch AFTER expiry date.`,
              reason: `Action at ${now.toLocaleString()} > Expiry ${expDate.toLocaleString()}`,
            });
            alert(
              "⚠️ NOTICE: This batch has expired. The shipment will be recorded, but an alert has been sent to the Admin."
            );
          }
        }
      }
    } catch (expErr) {
      console.warn("Expiry check failed (non-blocking):", expErr);
    }

    // Create Block data
    const index = 1; // Locked: Shipment is always Step 1
    const timestamp = new Date().toISOString();
    const previousHash = loadedLastBlock.hash;

    const data = {
      sender,
      originLocation,
      receiver,
      destLocation,
      quantity: qty,
      departureTime,
      evidenceURL,
    };

    const hash = CryptoJS.SHA256(
      previousHash + JSON.stringify(data) + timestamp
    ).toString();

    const shipmentBlock = {
      batchId,
      index,
      eventType: "SHIPMENT",
      role: "distributor",
      data,
      timestamp,
      previousHash,
      hash,
      createdBy,
    };

    status.innerText = "Appending shipment block...";

    await appendBlock(batchId, shipmentBlock);

    // Update Parent Status
    try {
      await db
        .collection("batches")
        .doc(batchId)
        .update({ status: "IN_TRANSIT" });
    } catch (e) {
      console.warn("Parent status update failed:", e);
    }

    status.style.color = "green";
    status.innerText = `✅ Shipment Recorded! Block #${index} appended.`;
    alert("Shipment Recorded Successfully!");

    // Reset
    document.getElementById("sender").value = "";
    document.getElementById("receiver").value = "";
    document.getElementById("shipmentQty").value = "";
    document.getElementById("departureTime").value = "";
    document.getElementById("evidenceFile").value = "";

    loadedLastBlock = null;
  } catch (err) {
    console.error(err);
    status.style.color = "red";
    status.innerText = "❌ Shipment Failed: " + err.message;
    alert("Error: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

// Location Buttons
const btnGetOrigin = document.getElementById("btnGetOrigin");
if (btnGetOrigin) {
  btnGetOrigin.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      btnGetOrigin.innerText = "⏳";
      const code = await getDeviceLocationAsPlusCode();
      document.getElementById("originLocation").value = code;
      btnGetOrigin.innerText = "📍";
    } catch (err) {
      alert(err);
      btnGetOrigin.innerText = "📍";
    }
  });
}

const btnGetDest = document.getElementById("btnGetDest");
if (btnGetDest) {
  btnGetDest.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      btnGetDest.innerText = "⏳";
      const code = await getDeviceLocationAsPlusCode();
      document.getElementById("destLocation").value = code;
      btnGetDest.innerText = "📍";
    } catch (err) {
      alert(err);
      btnGetDest.innerText = "📍";
    }
  });
}

// Check for Recalls
document.addEventListener("DOMContentLoaded", () => {
  // Wait for auth
  setTimeout(checkForActionableRecalls, 3000);
});

async function checkForActionableRecalls() {
  try {
    console.log("Checking for recalls...");
    const snap = await db
      .collection("batches")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
      const batchId = doc.id;

      // Check Last Block Event
      const logsSnap = await db
        .collection("batches")
        .doc(batchId)
        .collection("logs")
        .orderBy("index", "desc")
        .limit(1)
        .get();

      if (logsSnap.empty) continue;
      const lastBlock = logsSnap.docs[0].data();

      // IF Last Event is RECALL -> This is "BEING_RECALLED" state.
      if (lastBlock.eventType === "RECALL") {
        // Fetch complete logs to check involvment
        const allLogsSnap = await db
          .collection("batches")
          .doc(batchId)
          .collection("logs")
          .orderBy("index")
          .get();
        const allLogs = allLogsSnap.docs.map((d) => d.data());

        // Check logical involvement
        const currentUserId =
          auth.currentUser?.uid || localStorage.getItem("metamask_wallet");

        const myShipment = allLogs.find(
          (l) => l.role === "distributor" && l.createdBy === currentUserId
        );

        if (myShipment) {
          const doPickup = confirm(
            `⚠️ RECALL ALERT - BATCH ${batchId}\n\nThis batch has been marked for RECALL by Admin.\n\nDo you confirm you have initiated the return transit (Pickup)?`
          );
          if (doPickup) {
            await processReturnTransit(batchId, lastBlock);
          }
        }
      }
    }
  } catch (e) {
    console.warn("Recall auto-check failed:", e);
  }
}

async function processReturnTransit(batchId, lastBlock) {
  try {
    const newIndex = lastBlock.index + 1;
    const previousHash = lastBlock.hash;
    const timestamp = new Date().toISOString();

    const data = {
      action: "RETURN_TRANSIT_INITIATED",
      notes: "Distributor confirmed recall pickup via Auto-Prompt.",
      confirmedBy: auth.currentUser?.email || "Distributor",
    };

    const hash = CryptoJS.SHA256(
      previousHash + JSON.stringify(data) + timestamp
    ).toString();

    const createdBy =
      auth.currentUser?.uid ||
      localStorage.getItem("metamask_wallet") ||
      "DISTRIBUTOR";

    const returnBlock = {
      batchId,
      index: newIndex,
      eventType: "RETURN_TRANSIT",
      role: "distributor",
      data,
      timestamp,
      previousHash,
      hash,
      createdBy,
    };

    // Append to Chain
    await appendBlock(batchId, returnBlock);

    alert(
      `✅ Pickup Recorded for Batch ${batchId}. Block #${newIndex} appended.`
    );
  } catch (e) {
    alert("Error recording pickup: " + e.message);
  }
}
