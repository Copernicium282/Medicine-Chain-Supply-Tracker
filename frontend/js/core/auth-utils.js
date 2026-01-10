function redirectToLogin() {
  window.location.href = "../login.html";
}

function logout() {
  // Firebase logout (if logged in)
  if (window.auth?.currentUser) {
    auth.signOut();
  }

  // Unified Logout
  // Clear persistent wallet
  localStorage.removeItem("metamask_wallet");
  // Clear session wallet
  sessionStorage.removeItem("metamask_user");

  // Redirect to login (Absolute path to be safe)
  const isDashboard = window.location.pathname.includes("/dashboards/");
  if (isDashboard) {
    window.location.href = "../login.html";
  } else {
    window.location.href = "login.html";
  }
}

// MetaMask detection helper
async function getEthereum() {
  if (typeof window.ethereum !== "undefined") {
    return window.ethereum;
  }

  // Retry Logic
  // Some browsers inject the Ethereum provider asynchronously.
  // We wait 500ms and check again to avoid false negatives on slower devices.
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (typeof window.ethereum !== "undefined") {
    return window.ethereum;
  }

  throw new Error("MetaMask not detected.");
}
