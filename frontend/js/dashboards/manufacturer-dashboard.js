// Check access
requireAccess("manufacturer");

console.log("Manufacturer dashboard loaded.");

// Create New Batch
/**
 * Validates batch creation inputs.
 *
 * @param {Object} inputs - Raw inputs.
 * @returns {Promise<string|null>} Error message or null.
 */
async function validateBatchInputs(inputs) {
  const {
    batchId,
    medicineName,
    quantity,
    factoryLocation,
    productionDate,
    expiryDate,
    file,
  } = inputs;

  if (
    !batchId ||
    !medicineName ||
    !quantity ||
    !factoryLocation ||
    !productionDate ||
    !expiryDate ||
    !file
  ) {
    return "Please fill all fields.";
  }

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0)
    return "Quantity must be a positive integer.";

  if (new Date(expiryDate) <= new Date(productionDate)) {
    return "Expiry date must be after production date.";
  }

  // Async Checks
  // We validate the address *before* submission because correcting a bad location
  // after it is written to the immutable blockchain is impossible.
  if (!(await validateAddress(factoryLocation))) {
    return `Location '${factoryLocation}' verification failed. Use a valid Plus Code.`;
  }

  const existing = await db.collection("batches").doc(batchId).get();
  if (existing.exists) return "Batch ID already exists.";

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

  return null;
}

// Create New Batch
async function createBatch() {
  const inputs = {
    batchId: document.getElementById("batchId").value.trim(),
    medicineName: document.getElementById("medicineName").value.trim(),
    quantity: document.getElementById("quantity").value.trim(),
    factoryLocation: document.getElementById("factoryLocation").value.trim(),
    productionDate: document.getElementById("productionDate").value,
    expiryDate: document.getElementById("expiryDate").value,
    file: document.getElementById("certificateFile").files[0],
  };

  const status = document.getElementById("uploadStatus");
  const btn = document.getElementById("createBatchBtn");

  status.innerText = "Validating...";

  const errorMsg = await validateBatchInputs(inputs);
  if (errorMsg) {
    status.innerText = "";
    alert(errorMsg);
    return;
  }

  // Proceed...
  const {
    batchId,
    medicineName,
    quantity,
    factoryLocation,
    productionDate,
    expiryDate,
    file,
  } = inputs;
  const qty = Number(quantity);

  // Lock UI
  btn.disabled = true;
  status.style.color = "blue";
  status.innerText = "Uploading certificate...";

  try {
    // Upload to Supabase
    const filePath = `certificates/${batchId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("certificates")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    // Get public link
    const { data: signedData, error: signedError } = await supabase.storage
      .from("certificates")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (signedError) throw signedError;

    const certificateURL = signedData.signedUrl;

    // Get User ID
    const createdBy =
      auth.currentUser?.uid ||
      localStorage.getItem("metamask_wallet") ||
      sessionStorage.getItem("metamask_user");

    if (!createdBy) {
      throw new Error("Unable to determine user identity.");
    }

    // Genesis Block Data
    const index = 0;
    const timestamp = new Date().toISOString();
    const previousHash = "0";

    const data = {
      medicineName,
      quantity: qty,
      factoryLocation,
      productionDate,
      expiryDate,
      certificateURL,
    };

    const hash = CryptoJS.SHA256(
      previousHash + JSON.stringify(data) + timestamp
    ).toString();

    const genesisBlock = {
      batchId,
      index,
      eventType: "GENESIS",
      role: "manufacturer",
      data,
      timestamp,
      previousHash,
      hash,
      createdBy,
    };

    status.innerText = "Creating genesis block...";

    // Save to Firestore
    // 1. Parent Document
    const batchRef = db.collection("batches").doc(batchId);

    await batchRef.set({
      batchId,
      medicineName,
      quantity: qty,
      timestamp,
      createdBy,
      status: "IN_FACTORY",
    });

    await batchRef.collection("logs").doc("0").set(genesisBlock);

    status.style.color = "green";
    status.innerText =
      "✅ Batch Created Successfully! Genesis Block #0 recorded.";
    alert("Batch Created Successfully!");

    // Generate QR Code
    const qrContainer = document.getElementById("qrContainer");
    qrContainer.innerHTML = "";

    const verifyURL = new URL("../verify.html", window.location.href).href;

    const hiddenDiv = document.createElement("div");
    Object.assign(hiddenDiv.style, {
      position: "absolute",
      visibility: "hidden",
    });
    document.body.appendChild(hiddenDiv);

    new QRCode(hiddenDiv, {
      text: verifyURL,
      width: 200,
      height: 200,
    });

    // Download & Display Logic
    setTimeout(() => {
      try {
        const img = hiddenDiv.querySelector("img");
        if (!img || !img.src) {
          throw new Error("QR code image not found.");
        }

        // 1. Trigger Download
        const link = document.createElement("a");
        link.href = img.src;
        link.download = `QR_Batch_${batchId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 2. Display in UI
        const displayImg = img.cloneNode(true);
        displayImg.style.width = "200px";
        displayImg.style.height = "200px";
        displayImg.style.margin = "0 auto 1rem auto";
        displayImg.style.display = "block";
        displayImg.style.border = "4px solid white";
        displayImg.style.borderRadius = "0.5rem";

        qrContainer.innerHTML = ""; // Clear loader/text
        qrContainer.appendChild(displayImg);
        qrContainer.innerHTML += `
            <div class="bg-green-500/10 border border-green-500 rounded-lg p-4 text-center">
                <strong class="text-green-500">✅ QR Sticker Downloaded</strong><br>
                <small class="text-gray-400">File saved to downloads.</small>
            </div>
        `;
      } catch (err) {
        console.error("QR Error", err);
        qrContainer.innerHTML = `<span class="text-red-500 font-bold">Failed to generate QR download.</span>`;
      }
      document.body.removeChild(hiddenDiv);
    }, 500);

    // Reset inputs
    document.getElementById("batchId").value = "";
    document.getElementById("quantity").value = "";
    document.getElementById("productionDate").value = "";
    document.getElementById("expiryDate").value = "";
    document.getElementById("certificateFile").value = "";
  } catch (err) {
    console.error(err);
    status.style.color = "red";
    status.innerText = "❌ Creation Failed: " + err.message;
    alert("Error: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

// Location Button
const btnGetLoc = document.getElementById("btnGetLoc");
if (btnGetLoc) {
  btnGetLoc.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      btnGetLoc.innerText = "⏳";
      const code = await getDeviceLocationAsPlusCode();
      document.getElementById("factoryLocation").value = code;
      btnGetLoc.innerText = "📍";
    } catch (err) {
      alert(err);
      btnGetLoc.innerText = "📍";
    }
  });
}

// Auto-check for Returns
document.addEventListener("DOMContentLoaded", async () => {
  // Sync Check (Self-Healing)
  if (window.localNode && typeof localNode.performSelfHealing === "function") {
    try {
      console.log("Running Integrity Check...");
      await localNode.performSelfHealing(db);
    } catch (e) {
      console.warn("Self-Healing check failed", e);
    }
  }
  setTimeout(checkActionableReturns, 3000);
});

async function checkActionableReturns() {
  try {
    console.log("Checking for returns...");
    const snap = await db
      .collection("batches")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
      const batchId = doc.id;

      const logsSnap = await db
        .collection("batches")
        .doc(batchId)
        .collection("logs")
        .orderBy("index", "desc")
        .limit(1)
        .get();

      if (logsSnap.empty) continue;
      const lastBlock = logsSnap.docs[0].data();

      if (lastBlock.eventType === "RETURN_TRANSIT") {
        const genesisSnap = await db
          .collection("batches")
          .doc(batchId)
          .collection("logs")
          .doc("0")
          .get();
        if (genesisSnap.exists) {
          const genesis = genesisSnap.data();
          const currentUserId =
            auth.currentUser?.uid || localStorage.getItem("metamask_wallet");

          if (genesis.createdBy === currentUserId) {
            const doConfirm = confirm(
              `↩️ RETURN ARRIVED - BATCH ${batchId}\n\nDistributor has sent this recalled batch back.\n\nDo you confirm receipt at factory?`
            );
            if (doConfirm) {
              await processReturnReceipt(batchId, lastBlock);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Auto-return check error:", e);
  }
}

async function processReturnReceipt(batchId, lastBlock) {
  try {
    const newIndex = lastBlock.index + 1;
    const previousHash = lastBlock.hash;
    const timestamp = new Date().toISOString();

    const data = {
      action: "RETURN_CONFIRMED",
      notes: "Batch returned to factory via Auto-Confirm.",
      confirmedBy: auth.currentUser?.email || "Manufacturer",
    };

    const hash = CryptoJS.SHA256(
      previousHash + JSON.stringify(data) + timestamp
    ).toString();

    const createdBy =
      auth.currentUser?.uid ||
      localStorage.getItem("metamask_wallet") ||
      "MANUFACTURER";

    const returnBlock = {
      batchId,
      index: newIndex,
      eventType: "RETURN_COMPLETED",
      role: "manufacturer",
      data,
      timestamp,
      previousHash,
      hash,
      createdBy,
    };

    // Append to Chain
    await db
      .collection("batches")
      .doc(batchId)
      .collection("logs")
      .doc(newIndex.toString())
      .set(returnBlock);

    // Update Parent
    try {
      await db.collection("batches").doc(batchId).update({
        status: "RECALLED",
      });
    } catch (updateErr) {
      console.warn(
        "Parent status update failed, but Block appended.",
        updateErr
      );
    }

    alert(`✅ Batch ${batchId} Recall Completed (Return Recorded on Chain).`);
  } catch (e) {
    alert("Error processing return: " + e.message);
  }
}
