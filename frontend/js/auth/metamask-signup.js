let signupStep = 1;
let signupWallet = null;

async function signupWithMetamask() {
  const btn = document.getElementById("metaBtn");
  const originalText = "Sign Up with Metamask";

  // Prevent multiple double-clicks which could trigger multiple wallet popups or race conditions.
  if (btn.disabled) return;

  if (!window.ethereum) {
    alert("MetaMask not detected");
    return;
  }

  try {
    // STEP 1: Connect Wallet
    if (signupStep === 1) {
      const role = document.getElementById("role").value;
      if (
        !["manufacturer", "distributor", "pharmacy", "admin"].includes(role)
      ) {
        throw new Error("Invalid role selected");
      }

      let accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || !accounts.length) {
        throw new Error("No MetaMask account selected");
      }

      signupWallet = accounts[0];

      // Check for Existing Registrations
      // We must prevent a user from accidentally creating a duplicate account or overwriting their existing role
      // if they just forgot they had an account.
      const existing = await db.collection("roles").doc(signupWallet).get();
      if (existing.exists) {
        const shortWallet =
          signupWallet.substring(0, 6) + "..." + signupWallet.substring(38);
        const switchWallet = confirm(
          `Wallet ${shortWallet} is already registered as a ${
            existing.data().role
          }.\n\nDo you want to use a different wallet?`
        );

        if (switchWallet) {
          // Force wallet selection
          await window.ethereum.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          });

          // Re-fetch accounts after switch
          accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            signupWallet = accounts[0];
            // Re-check the new wallet
            const newExisting = await db
              .collection("roles")
              .doc(signupWallet)
              .get();
            if (newExisting.exists) {
              alert("This wallet is also already registered. Please login.");
              return;
            }
            // If new wallet is valid, proceed to Step 2
            signupStep = 2;
            btn.innerText = "Verify Signature (Click Here)";
            btn.style.backgroundColor = "#28a745"; // Green
            return;
          }
        } else {
          alert("Please login with your existing account.");
        }
        return;
      }

      // Move to Step 2
      signupStep = 2;
      btn.innerText = "Verify Signature (Click Here)";
      btn.style.backgroundColor = "#28a745"; // Green
      return;
    }

    // STEP 2: Sign & Register
    if (signupStep === 2 && signupWallet) {
      const role = document.getElementById("role").value;
      const msg = "Signup request for MedChain Supply Tracker";

      // Hex Encode the message
      // We encode the string to Hex because some mobile wallets and older web3 providers fail to sign
      // raw variable-length strings correctly. Hex ensures a consistent standard format.
      const msgHex =
        "0x" +
        Array.from(msg)
          .map((c) => c.charCodeAt(0).toString(16))
          .join("");

      // Request signature
      await window.ethereum.request({
        method: "personal_sign",
        params: [msgHex, signupWallet],
      });

      // Normalize Wallet Address
      // Ethereum addresses are case-insensitive in protocol but case-sensitive in strings.
      // We force lowercase to ensure that querying "0xABC" and "0xabc" always hits the same document.
      await db.collection("roles").doc(signupWallet.toLowerCase()).set({
        role,
        type: "metamask",
        createdAt: new Date(),
      });

      localStorage.setItem("metamask_wallet", signupWallet.toLowerCase());
      alert("MetaMask signup successful!");
      window.location.href = `dashboards/${role}-dashboard.html`;
    }
  } catch (err) {
    console.error("Metamask Signup Error:", err);
    alert("Error: " + err.message);

    // Reset on error
    signupStep = 1;
    signupWallet = null;
    btn.innerText = originalText;
    btn.style.backgroundColor = "";
  }
}
