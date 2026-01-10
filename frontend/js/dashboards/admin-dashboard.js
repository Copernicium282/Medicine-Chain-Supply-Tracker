// Check access
requireAccess("admin");

console.log("Admin dashboard loaded.");

let allBatches = [];

document.addEventListener("DOMContentLoaded", () => {
  loadAllBatches();

  // Search handler
  document.getElementById("searchBatchId").addEventListener("keyup", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allBatches.filter((b) =>
      b.id.toLowerCase().includes(term)
    );
    renderTable(filtered);
  });

  checkAlerts();
});

// Check for alerts
async function checkAlerts() {
  let alertDiv = document.getElementById("alertSection");
  if (!alertDiv) {
    alertDiv = document.createElement("div");
    alertDiv.id = "alertSection";
    alertDiv.style.marginBottom = "20px";
    const hr = document.querySelector(".content hr");
    if (hr) hr.parentNode.insertBefore(alertDiv, hr.nextSibling);
  }

  try {
    const snaps = await db
      .collection("admin_alerts")
      .orderBy("timestamp", "desc")
      .limit(5)
      .get();
    if (snaps.empty) {
      alertDiv.innerHTML = "";
      alertDiv.style.display = "none";
      return;
    }

    alertDiv.style.display = "block";
    let html = `<div style="background:rgba(254, 243, 199, 0.1); border:1px solid #f59e0b; border-radius:8px; padding:15px;">
            <h4 style="margin-top:0; color:#f59e0b; display:flex; align-items:center; gap:10px;">
                ⚠️ System Alerts (Auto-Healed)
                <button onclick="clearAlerts()" style="margin-left:auto; font-size:0.7em; background:transparent; border:1px solid #78350f; color:#f59e0b; cursor:pointer;">Clear</button>
            </h4>`;

    snaps.forEach((doc) => {
      const a = doc.data();
      html += `<div style="font-size:0.9em; border-bottom:1px solid rgba(245, 158, 11, 0.2); padding:8px 0; color:#d97706;">
                <span style="opacity:0.8;">[${new Date(
                  a.timestamp
                ).toLocaleTimeString()}]</span> 
                <strong>Batch ${a.batchId}</strong>: ${a.details}
                ${
                  a.reason
                    ? `<br><span style="font-size:0.85em; opacity:0.8;">Reason: ${a.reason}</span>`
                    : ""
                }
            </div>`;
    });
    html += "</div>";
    alertDiv.innerHTML = html;
  } catch (e) {
    console.warn("Alert check failed", e);
  }
}

// Clear all alerts
async function clearAlerts() {
  if (!confirm("Clear all alerts?")) return;
  const snaps = await db.collection("admin_alerts").limit(50).get();
  const batch = db.batch();
  snaps.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  checkAlerts();
}

// Load Batches
async function loadAllBatches() {
  const tableBody = document.getElementById("batchTableBody");
  tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">Fetching blockchain data...</td></tr>`;

  try {
    // Run self-healing
    // Before displaying data, we cross-reference the Local Node's trusted history
    // against the Remote Firestore. If any discrepancies (like deleted blocks) are found,
    // the Local Node automatically restores them to ensure integrity.
    console.log("Running Pre-Load Integrity Check...");
    await localNode.performSelfHealing(db);

    const snapshot = await db
      .collection("batches")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();

    const promises = snapshot.docs.map(async (doc) => {
      const data = doc.data();
      let derivedStatus = data.status || "IN_FACTORY";

      // Check logs for real status
      try {
        const logsSnap = await db
          .collection("batches")
          .doc(doc.id)
          .collection("logs")
          .orderBy("index", "desc")
          .limit(1)
          .get();

        if (!logsSnap.empty) {
          const lastBlock = logsSnap.docs[0].data();
          if (lastBlock.eventType === "SHIPMENT") derivedStatus = "IN_TRANSIT";
          else if (lastBlock.eventType === "DELIVERY_CONFIRMATION")
            derivedStatus = "DELIVERED";
          else if (lastBlock.eventType === "RECALL")
            derivedStatus = "BEING_RECALLED";
          else if (lastBlock.eventType === "RETURN_COMPLETED")
            derivedStatus = "RECALLED";
        }
      } catch (e) {
        console.warn("Log fetch failed", e);
      }

      return {
        id: doc.id,
        ...data,
        status: derivedStatus,
      };
    });

    allBatches = await Promise.all(promises);
    renderTable(allBatches);
  } catch (err) {
    console.error(err);
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Error loading batches: ${err.message}</td></tr>`;
  }
}

function renderTable(list) {
  const tableBody = document.getElementById("batchTableBody");
  tableBody.innerHTML = "";

  if (list.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-400">No batches found.</td></tr>`;
    return;
  }

  list.forEach((batch) => {
    let status = "OK";
    let statusColor = "#4ade80"; // green-400

    // Determine Status
    // We prioritize the derived status (from logs) over the string status
    // to prevent UI spoofing. The derivation happens in `loadAllBatches`.
    const derivedStatus = batch.status || "UNKNOWN";

    if (derivedStatus === "RETURNED" || derivedStatus === "DELIVERED")
      statusColor = "#3b82f6"; // blue
    else if (derivedStatus === "RETURNING" || derivedStatus === "MIT")
      statusColor = "#f97316"; // orange
    else if (
      derivedStatus === "RECALLED" ||
      derivedStatus === "BEING_RECALLED" ||
      derivedStatus === "TAMPERED"
    )
      statusColor = "#ef4444"; // red
    else if (derivedStatus === "IN_TRANSIT") statusColor = "#facc15"; // yellow

    let medName = "N/A";
    if (batch.data && batch.data.medicineName)
      medName = batch.data.medicineName;
    else if (batch.medicineName) medName = batch.medicineName;

    let createdBy = batch.createdBy || "Unknown";
    if (createdBy.startsWith("0x"))
      createdBy = createdBy.substring(0, 8) + "...";

    // Row Styling
    const row = `
    <tr class="border-b border-gray-700 hover:bg-gray-800/50 transition-colors">
      <td class="p-4">
        <a
          href="../verify.html?batchId=${batch.id}"
          target="_blank"
          class="badge-link"
        >
          ${batch.id}
        </a>
      </td>
      <td class="p-4 text-gray-300">${medName}</td>
      <td class="p-4 text-gray-400 text-sm font-mono">${createdBy}</td>
      <td class="p-4 font-bold" style="color:${statusColor}">
        ${derivedStatus}
      </td>
      <td class="p-4 flex items-center gap-3">
        <button
          onclick="viewDetails('${batch.id}')"
          class="btn btn-outline-secondary"
          title="View Details"
        >
          👁️ View
        </button>
        ${
          !derivedStatus.includes("RECALL") && !derivedStatus.includes("RETURN")
            ? `
                    <button onclick="initiateRecall('${batch.id}')" 
                        class="btn btn-outline-danger" title="Flag for Recall">
                        ⚠️ Recall
                    </button>`
            : ""
        }
        ${
          derivedStatus.includes("RETURN")
            ? `
                    <button onclick="deleteBatchForce('${batch.id}')" 
                        class="btn btn-danger shadow-none" title="Force Delete (Admin Only)">
                        🗑️ Delete
                    </button>`
            : ""
        }
      </td>
    </tr>`;
    tableBody.innerHTML += row;
  });
}

function viewDetails(id) {
  window.location.href = `../verify.html?batchId=${id}`;
}

async function initiateRecall(id) {
  const reason = prompt(
    "Enter reason for recall (e.g., Safety Violation, Defect):"
  );
  if (!reason) return;

  try {
    let user = firebase.auth().currentUser;
    let userId = user ? user.email : null;

    // Fallback to Wallet ID if no Firebase User
    if (!userId) {
      userId =
        localStorage.getItem("metamask_wallet") ||
        sessionStorage.getItem("metamask_user");
    }

    if (!userId) throw new Error("Accidentally logged out (No Session Found).");

    // Append RECALL block
    const prevBlock = await getLastBlock(id);

    const newBlock = {
      index: prevBlock.index + 1,
      timestamp: new Date().toISOString(),
      eventType: "RECALL",
      role: "admin",
      createdBy: userId,
      previousHash: prevBlock.hash,
      data: {
        reason: reason,
        adminUser: userId,
      },
      hash: "", // Calculate
    };

    newBlock.hash = CryptoJS.SHA256(
      newBlock.previousHash + JSON.stringify(newBlock.data) + newBlock.timestamp
    ).toString(); // Calculate hash using existing CryptoJS

    await db.collection("batches").doc(id).collection("logs").add(newBlock);

    // Sync Local (assuming localNode is defined elsewhere)
    // await localNode.saveBatch(id, [newBlock]); // This appends/updates logic ideally

    alert("Recall Issued Successfully.");
    loadAllBatches();
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}

async function deleteBatchForce(id) {
  if (
    !confirm(
      "DANGER: This will permanently delete the batch history from Firestore. This cannot be undone. Are you sure?"
    )
  )
    return;

  // Firestore delete collection is tricky, usually need recursive.
  // For now we just delete parent doc usually leaves subcollections orphan in console but unreachable.
  // Best practice: verify we want to do this.
  try {
    // Delete logs one by one?!
    const logs = await db
      .collection("batches")
      .doc(id)
      .collection("logs")
      .get();
    const batch = db.batch();
    logs.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();
    await db.collection("batches").doc(id).delete();

    alert("Batch Deleted.");
    loadAllBatches();
  } catch (e) {
    alert(e.message);
  }
}

// Utils
async function getLastBlock(batchId) {
  const snapshot = await db
    .collection("batches")
    .doc(batchId)
    .collection("logs")
    .orderBy("index", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new Error("No blocks found for this batch. Chain broken?");
  }
  return snapshot.docs[0].data();
}

async function appendBlock(batchId, blockData) {
  // Add Log Entry
  const logRef = db
    .collection("batches")
    .doc(batchId)
    .collection("logs")
    .doc(blockData.index.toString());

  // Check collision
  const doc = await logRef.get();
  if (doc.exists) {
    throw new Error(
      `Block Index ${blockData.index} already exists! Concurrency error.`
    );
  }

  await logRef.set(blockData);
}

// System Health Check
async function runHealthCheck() {
  if (!confirm("Start System-Wide Integrity Scan? This may take a moment."))
    return;

  // Overlay
  const overlay = document.createElement("div");
  overlay.id = "healthCheckOverlay";
  overlay.className =
    "fixed inset-0 bg-brand-dark bg-opacity-95 z-[60] flex items-center justify-center p-4";

  // Status Box using Tailwind
  const statusDiv = document.createElement("div");
  statusDiv.id = "healthCheckStatus";
  statusDiv.className = "text-center text-white";
  statusDiv.innerHTML = `<div class="text-4xl mb-6 animate-pulse">🛡️ Scanning Blockchain...</div><div id="scanProgress" class="text-xl text-gray-400">Initializing...</div>`;

  overlay.appendChild(statusDiv);
  document.body.appendChild(overlay);

  try {
    const snapshot = await db.collection("batches").get();
    if (snapshot.empty) {
      statusDiv.innerHTML = `<div>No batches to scan.</div><button onclick='document.body.removeChild(this.parentNode.parentNode)' class="mt-6 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">Close</button>`;
      return;
    }

    const ids = [];
    snapshot.forEach((doc) => ids.push(doc.id));

    let tamperedList = [];
    let validList = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      document.getElementById("scanProgress").innerText = `Checking ${i + 1}/${
        ids.length
      }: ${id}`;

      // Verify
      const isValid = await verifyBatchIntegrity(id);
      if (isValid) validList.push(id);
      else tamperedList.push(id);
    }

    // Show Report (Tailwind Styled)
    statusDiv.innerHTML = "";
    const report = document.createElement("div");
    report.className =
      "bg-brand-card p-8 rounded-2xl border border-gray-700 w-full max-w-4xl shadow-2xl relative";

    report.innerHTML = `
            <h2 class="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">Network Health Report</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 h-96 my-6 text-left">
                <!-- Tampered Column -->
                <div class="flex flex-col border border-red-500/50 bg-red-900/10 rounded-lg overflow-hidden">
                    <h4 class="bg-red-900/40 text-red-500 font-bold p-3 border-b border-red-500/30 sticky top-0">❌ Tampered (${
                      tamperedList.length
                    })</h4>
                    <div class="overflow-y-auto flex-1 p-2 space-y-1">
                        ${
                          tamperedList.length > 0
                            ? tamperedList
                                .map(
                                  (id) =>
                                    `<div class="font-mono text-sm text-red-400 border-b border-red-800/30 pb-1">${id}</div>`
                                )
                                .join("")
                            : '<div class="p-4 text-gray-500 italic">None detected. System secure.</div>'
                        }
                    </div>
                </div>

                <!-- Valid Column -->
                <div class="flex flex-col border border-green-500/50 bg-green-900/10 rounded-lg overflow-hidden">
                    <h4 class="bg-green-900/40 text-green-500 font-bold p-3 border-b border-green-500/30 sticky top-0">✅ Valid (${
                      validList.length
                    })</h4>
                    <div class="overflow-y-auto flex-1 p-2 space-y-1">
                        ${validList
                          .map(
                            (id) =>
                              `<div class="font-mono text-sm text-green-400 border-b border-green-800/30 pb-1">${id}</div>`
                          )
                          .join("")}
                    </div>
                </div>
            </div>

            <div class="text-right">
                <button onclick="document.body.removeChild(document.getElementById('healthCheckOverlay'))" 
                    class="bg-brand-primary hover:bg-brand-secondary text-white px-6 py-2 rounded-lg font-bold shadow-lg transition-colors">
                    Close Report
                </button>
            </div>
        `;

    statusDiv.appendChild(report);
  } catch (e) {
    console.error(e);
    statusDiv.innerHTML = `<div class="text-red-500 text-xl font-bold">Error during scan: ${e.message}</div><button onclick='document.body.removeChild(document.getElementById("healthCheckOverlay"))' class="mt-6 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">Close</button>`;
  }
}

async function verifyBatchIntegrity(batchId) {
  try {
    const snap = await db
      .collection("batches")
      .doc(batchId)
      .collection("logs")
      .orderBy("index")
      .get();
    if (snap.empty) return false;

    const logs = snap.docs.map((doc) => doc.data());
    return verifyChain(logs); // Uses shared logic
  } catch (e) {
    return false;
  }
}
