async function loginWithMetamask() {
  // Identity Conflict Prevention
  // If a user was previously logged in via Email/Pass (Firebase), we must sign them out first.
  // Otherwise, the system might have a "Hybrid" state where `auth.currentUser` is set but they are acting as a Web3 user.
  if (firebase.auth().currentUser) {
    await firebase.auth().signOut();
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (!accounts || accounts.length === 0) {
      alert("No MetaMask account selected.");
      return;
    }

    const wallet = accounts[0];
    const walletLower = wallet.toLowerCase();

    await window.ethereum.request({
      method: "personal_sign",
      params: ["Login request for MedChain Supply Tracker", wallet],
    });

    // Address Normalization Lookup
    // Since some wallets modify checksum casing (e.g. 0xA1b2...), we must check both the exact ID
    // and the purely lowercase ID to find the user's document.
    let roleDoc = await db.collection("roles").doc(wallet).get();
    if (!roleDoc.exists) {
      roleDoc = await db.collection("roles").doc(walletLower).get();
    }

    if (!roleDoc.exists) {
      alert("Wallet not registered.");
      return;
    }

    // Save the version that matched (or lowercase as default preference)
    localStorage.setItem("metamask_wallet", roleDoc.id);

    window.location.href = `dashboards/${roleDoc.data().role}-dashboard.html`;
  } catch (err) {
    console.error(err);
    alert("MetaMask login failed: " + err.message);
  }
}
