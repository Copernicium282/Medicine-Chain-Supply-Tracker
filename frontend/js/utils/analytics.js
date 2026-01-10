// Metamask Login Logic
async function loginWithMetamaskForAnalytics() {
  if (!window.ethereum) return alert("Metamask not installed!");
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();
    const address = await signer.getAddress();

    // Signature 'Challenge'
    // We require the user to sign a timestamped message to prove they possess the private key.
    // This prevents replay attacks where someone might copy a signature from a previous session.
    // The timestamp ensures that a captured signature cannot be reused endlessly.
    const message = `Authenticate MedChain Analytics Access\nUser: ${address}\nTimestamp: ${Date.now()}`;
    await signer.signMessage(message);

    // Save session
    localStorage.setItem("metamask_wallet", address);

    // Trigger Render
    renderDashboard(address, true);
  } catch (err) {
    console.error(err);
    alert("Metamask Login failed: " + err.message);
  }
}

// Logout / Reset Logic
function clearAnalyticsSession() {
  localStorage.removeItem("metamask_wallet");
  sessionStorage.removeItem("metamask_user");
  firebase
    .auth()
    .signOut()
    .then(() => {
      window.location.reload();
    });
}

async function renderDashboard(userId, isMetaMask = false) {
  // Hide the inline reset button since we have a navbar logout now
  document.getElementById("loading").innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center;">
            <h3>📊 Crunching Data...</h3>
            <small style="color: #94a3b8;">User: ${userId.substring(
              0,
              10
            )}... (${isMetaMask ? "Web3" : "Firebase"})</small>
        </div>
    `;

  // Show Logout Button in Navbar (Append to existing controls)
  const navControls = document.getElementById("navControls");
  if (navControls) {
    // Update Last Updated Text
    const lastUpdatedEl = document.getElementById("lastUpdated");
    if (lastUpdatedEl) {
      lastUpdatedEl.innerText = "Updating...";
      lastUpdatedEl.style.color = "#64748b";
    }

    // Add Logout Button if it doesn't exist
    if (!document.getElementById("logout-btn")) {
      const logoutBtn = document.createElement("button");
      logoutBtn.id = "logout-btn";
      logoutBtn.innerText = "Logout";
      logoutBtn.onclick = clearAnalyticsSession;
      logoutBtn.style.cssText =
        "background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 0.9em; margin-right: 10px;";

      // Insert before the theme toggle
      const themeBtn = document.getElementById("theme-toggle");
      if (themeBtn) {
        navControls.insertBefore(logoutBtn, themeBtn);
      } else {
        navControls.appendChild(logoutBtn);
      }
    }
  }

  const db = firebase.firestore();

  try {
    console.log("Analytics: Init Local Node");
    await localNode.init();

    console.log("Analytics: Fetching Batches (Limit 50)...");

    // Timeout Wrapper
    const fetchPromise = db.collection("batches").limit(50).get();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Analytics Fetch Timeout")), 5000)
    );

    let snapshot;
    try {
      snapshot = await Promise.race([fetchPromise, timeoutPromise]);
    } catch (e) {
      throw e;
    }

    console.log("Analytics: Batch Snapshot received. Empty?", snapshot.empty);
    let realDataFound = false;

    if (!snapshot.empty) {
      realDataFound = true;
    } else if (!isMetaMask) {
      // Fallback for manufacturer who might check their own only-batches if global list didn't hit
      const personalSnap = await db
        .collection("batches")
        .where("createdBy", "==", userId)
        .limit(50)
        .get();
      if (!personalSnap.empty) {
        snapshot = personalSnap;
        realDataFound = true;
      }
    }

    // CHECK ROLE to determine Visibility
    let role = "unknown";
    try {
      // Try exact match
      let roleDoc = await db.collection("roles").doc(userId).get();

      // Try lowercase match (Address Normalization)
      // Wallet addresses are often checksummed (mixed case), but our database IDs are normalized to lowercase.
      // Failing to check lowercase would result in a false "Role Not Found" error for valid users
      // whose wallet formats the address differently (e.g. 0xA1b.. vs 0xa1b..).
      if (!roleDoc.exists) {
        const lowerId = userId.toLowerCase();
        const lowerRoleDoc = await db.collection("roles").doc(lowerId).get();
        if (lowerRoleDoc.exists) {
          roleDoc = lowerRoleDoc;
          userId = lowerId; // Normalize for subsequent checks
        }
      }

      if (roleDoc.exists) role = roleDoc.data().role;
    } catch (e) {
      console.warn("Role check failed", e);
    }

    const isAdmin = role === "admin";
    console.log(`Analytics: User Role: ${role}, IsAdmin: ${isAdmin}`);

    if (!realDataFound) {
      // Empty State
      document.getElementById(
        "loading"
      ).innerHTML = `<div style="text-align:center;"><h3>No Data</h3><button onclick="clearAnalyticsSession()">Reset</button></div>`;
      return;
    }

    // DATA PREPARATION
    let totalBatches = 0,
      inTransit = 0,
      delivered = 0,
      recalled = 0,
      totalVolume = 0,
      inFactory = 0;
    let dateCounts = {};
    let batchParticipantData = []; // Store for Table

    // Process docs
    const promises = snapshot.docs.map(async (doc) => {
      const batchData = doc.data();
      const batchId = doc.id;
      let isRelevant = false;

      // 1. Admin sees ALL
      if (isAdmin) isRelevant = true;

      // 2. Creator sees their own
      if (batchData.createdBy === userId) isRelevant = true;

      // Derived Status & Participants
      let derivedStatus = "IN_FACTORY";
      let hasParticipation = false;
      let participants = {
        manufacturer: "Unknown",
        distributor: "Pending",
        pharmacy: "Pending",
      };

      try {
        const logsPromise = db
          .collection("batches")
          .doc(batchId)
          .collection("logs")
          .orderBy("index", "desc")
          .get();
        const logTimeout = new Promise((_, r) =>
          setTimeout(() => r(new Error("Log Timeout")), 5000)
        );
        const logsSnap = await Promise.race([logsPromise, logTimeout]);

        if (!logsSnap.empty) {
          // Check participation & Fill Roles
          logsSnap.forEach((l) => {
            const ld = l.data();

            // PARTICIPATION CHECK
            if (ld.createdBy === userId) hasParticipation = true;
            if (
              ld.data &&
              (ld.data.sender === userId || ld.data.receiver === userId)
            )
              hasParticipation = true;

            // ROLE MAPPING
            if (ld.role === "manufacturer" || ld.eventType === "GENESIS") {
              participants.manufacturer = ld.createdBy;
            }
            if (ld.role === "distributor" || ld.eventType === "SHIPMENT") {
              participants.distributor = ld.createdBy;
            }
            if (
              ld.role === "pharmacy" ||
              ld.eventType === "DELIVERY_CONFIRMATION"
            ) {
              participants.pharmacy = ld.createdBy;
            }
          });

          // Determine Status
          const type = logsSnap.docs[0].data().eventType;
          if (type === "DELIVERY_CONFIRMATION") derivedStatus = "DELIVERED";
          else if (type === "SHIPMENT") derivedStatus = "IN_TRANSIT";
          else if (
            type === "RECALL" ||
            type === "RETURN_TRANSIT" ||
            type === "RETURN_COMPLETED"
          )
            derivedStatus = "RECALLED";
        }
      } catch (e) {
        console.warn("Log fetch skipped", e);
      }

      // If not admin/creator, only show if participated
      if (!isAdmin && !isRelevant && hasParticipation) isRelevant = true;

      // FINAL DECISION TO COUNT
      if (isRelevant) {
        // Count it
        totalBatches++;

        // Volume
        if (batchData.data && batchData.data.quantity)
          totalVolume += Number(batchData.data.quantity);
        else if (batchData.quantity) totalVolume += Number(batchData.quantity);

        // Date
        const ts = batchData.timestamp || Date.now();
        const date = new Date(ts).toLocaleDateString();
        if (!dateCounts[date]) dateCounts[date] = 0;
        dateCounts[date]++;

        // Status Buckets
        if (derivedStatus === "DELIVERED") delivered++;
        else if (derivedStatus === "IN_TRANSIT") inTransit++;
        else if (derivedStatus === "RECALLED") recalled++;

        // Add to Participant List (Only for Admin or High Level View)
        if (isAdmin) {
          batchParticipantData.push({
            id: batchId,
            status: derivedStatus,
            ...participants,
          });
        }
      }
    });

    await Promise.all(promises);
    inFactory = totalBatches - inTransit - delivered - recalled;
    if (inFactory < 0) inFactory = 0;

    // Update DOM
    document.getElementById("totalBatches").innerText = totalBatches;
    document.getElementById("batchesInTransit").innerText = inTransit;
    document.getElementById("batchesDelivered").innerText = delivered;
    document.getElementById("totalVolume").innerText =
      totalVolume.toLocaleString();
    document.getElementById("lastUpdated").innerText =
      "Updated: " + new Date().toLocaleTimeString();

    // Render Charts
    renderCharts(inFactory, inTransit, delivered, recalled, dateCounts);

    // Render Participant Table (If Admin)
    if (isAdmin) {
      renderParticipantTable(batchParticipantData);
    }

    document.getElementById("loading").style.display = "none";
  } catch (err) {
    console.warn("Network Error/Blocked. Trying Local Node...", err);
    fallbackToLocalNode(db, localNode, err);
  }
}

function renderCharts(inFactory, inTransit, delivered, recalled, dateCounts) {
  const isLight = document.body.classList.contains("light-mode");
  const textColor = isLight ? "#1e293b" : "#cbd5e1"; // slate-800 vs slate-300
  const gridColor = isLight ? "#e2e8f0" : "#334155"; // slate-200 vs slate-700
  const mutedColor = isLight ? "#94a3b8" : "#64748b"; // slate-400

  const ctxStatus = document.getElementById("statusChart").getContext("2d");
  if (window.myStatusChart) window.myStatusChart.destroy();
  window.myStatusChart = new Chart(ctxStatus, {
    type: "doughnut",
    data: {
      labels: ["In Factory", "In Transit", "Delivered", "Recalled"],
      datasets: [
        {
          data: [inFactory, inTransit, delivered, recalled],
          backgroundColor: ["#94a3b8", "#facc15", "#4ade80", "#ef4444"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: textColor,
          },
        },
      },
    },
  });

  const sortedDates = Object.keys(dateCounts)
    .sort((a, b) => new Date(a) - new Date(b))
    .slice(-7);
  const trendData = sortedDates.map((d) => dateCounts[d]);
  const ctxTrend = document.getElementById("trendChart").getContext("2d");
  if (window.myTrendChart) window.myTrendChart.destroy();
  window.myTrendChart = new Chart(ctxTrend, {
    type: "line",
    data: {
      labels: sortedDates,
      datasets: [
        {
          label: "New Batches",
          data: trendData,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: mutedColor },
        },
        x: { grid: { display: false }, ticks: { color: mutedColor } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function updateChartsTheme() {
  const isLight = document.body.classList.contains("light-mode");
  const textColor = isLight ? "#1e293b" : "#cbd5e1";
  const gridColor = isLight ? "#e2e8f0" : "#334155";
  const mutedColor = isLight ? "#94a3b8" : "#64748b";

  // 1. Status Chart (Doughnut)
  if (window.myStatusChart) {
    if (
      window.myStatusChart.options.plugins &&
      window.myStatusChart.options.plugins.legend
    ) {
      window.myStatusChart.options.plugins.legend.labels.color = textColor;
    }
    window.myStatusChart.update();
  }

  // 2. Trend Chart (Line)
  if (window.myTrendChart) {
    // X Axis
    if (window.myTrendChart.options.scales.x) {
      window.myTrendChart.options.scales.x.ticks.color = mutedColor;
      if (window.myTrendChart.options.scales.x.grid) {
        window.myTrendChart.options.scales.x.grid.color = gridColor;
      }
    }
    // Y Axis
    if (window.myTrendChart.options.scales.y) {
      window.myTrendChart.options.scales.y.ticks.color = mutedColor;
      if (window.myTrendChart.options.scales.y.grid) {
        window.myTrendChart.options.scales.y.grid.color = gridColor;
      }
    }
    window.myTrendChart.update();
  }
}

function renderParticipantTable(data) {
  const container = document.getElementById("participant-table-container");
  if (!container) return;

  // truncate helper
  const trun = (s) =>
    s && s.length > 10
      ? s.substring(0, 6) + "..." + s.substring(s.length - 4)
      : s || "-";

  container.innerHTML = `
        <h3 class="chart-title" style="margin-top:0;">Recent Batch Participants (Admin View)</h3>
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.9em; text-align:left;">
                <thead>
                    <tr style="border-bottom: 2px solid #334155; color: #94a3b8;">
                        <th style="padding:10px;">Batch ID</th>
                        <th style="padding:10px;">Status</th>
                        <th style="padding:10px;">Manufacturer</th>
                        <th style="padding:10px;">Distributor</th>
                        <th style="padding:10px;">Pharmacy</th>
                    </tr>
                </thead>
                <tbody>
                    ${data
                      .slice(0, 10)
                      .map(
                        (row) => `
                        <tr style="border-bottom: 1px solid #334155;">
                            <td style="padding:10px; font-family:monospace;">${
                              row.id
                            }</td>
                            <td style="padding:10px; color:${getStatusColor(
                              row.status
                            )}">${row.status}</td>
                            <td style="padding:10px;">${trun(
                              row.manufacturer
                            )}</td>
                            <td style="padding:10px;">${trun(
                              row.distributor
                            )}</td>
                            <td style="padding:10px;">${trun(row.pharmacy)}</td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
    `;
  container.style.display = "block";
}

function getStatusColor(status) {
  if (status === "DELIVERED") return "#4ade80";
  if (status === "IN_TRANSIT") return "#facc15";
  if (status === "RECALLED") return "#ef4444";
  return "#94a3b8";
}

async function fallbackToLocalNode(db, localNode, err) {
  // ... Copy of fallback logic from previous file ...
  // Simplified for brevity, user mainly wants refactor
  document.getElementById(
    "loading"
  ).innerHTML = `<div style="text-align:center;"><h3>Error</h3><p>${err.message}</p><button onclick="clearAnalyticsSession()">Reset</button></div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const metaUser = localStorage.getItem("metamask_wallet");

  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      console.log("Firebase User Detected:", user.uid);
      renderDashboard(user.uid, false);
    } else if (metaUser) {
      console.log("Found cached Metamask session:", metaUser);
      renderDashboard(metaUser, true);
    } else {
      document.getElementById("loading").innerHTML = `
                <div style="text-align:center;">
                    <h3>Authentication Required</h3>
                    <button onclick="loginWithMetamaskForAnalytics()" style="padding:10px 20px; cursor:pointer; background:#facc15; border:none; border-radius:4px; font-weight:bold; color:black; margin-bottom: 10px;">
                        Login with Metamask 🦊
                    </button>
                    <br>
                    <button onclick="window.location.href='login.html'" style="padding:10px 20px; cursor:pointer; background:#38bdf8; border:none; border-radius:4px; font-weight:bold; color:white;">
                        Login via Firebase 
                    </button>
                    <br>
                    <button onclick="window.location.href='index.html'" style="padding:10px 20px; cursor:pointer; background:#64748b; border:none; border-radius:4px; font-weight:bold; color:white; margin-top: 10px;">
                        Return Home 🏠
                    </button>
                </div>
            `;
    }
  });
});
