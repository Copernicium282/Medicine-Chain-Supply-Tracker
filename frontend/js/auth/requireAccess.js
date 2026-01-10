/**
 * Gatekeeper function to enforce Role-Based Access Control (RBAC).
 *
 * @param {string} requiredRole - The role required to view this page (e.g. 'manufacturer').
 *
 * Logic:
 * 1. Wait for Firebase/Metamask to resolve identity.
 * 2. Check the 'roles' collection in Firestore.
 * 3. If mismatch, force redirect to login.
 */
async function requireAccess(requiredRole) {
  let user = null;

  // Wait for Firebase to resolve
  // We cannot proceed until the auth state is determined (loaded or null).
  // Using a promise wrapper allows us to `await` the event listener cleanly.
  await new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      user = u;
      unsubscribe();
      resolve();
    });
  });

  let id = null;

  // Firebase user
  if (user) {
    id = user.uid;
  } else {
    // MetaMask fallback
    // If Firebase User is null, check if there is a cached Web3 wallet session.
    // We support both localStorage (persistent) and sessionStorage (tab-only) for flexibility.
    const wallet =
      localStorage.getItem("metamask_wallet") ||
      sessionStorage.getItem("metamask_user");
    if (wallet) id = wallet;
  }

  console.log(
    "[Auth Debug] Checked Access. Msg: ",
    requiredRole,
    " | AuthUser:",
    user?.uid,
    " | Wallet:",
    id
  );

  // No auth → redirect
  if (!id) {
    redirectToLogin();
    return;
  }

  // Fetch role
  try {
    const roleDoc = await db.collection("roles").doc(id).get();

    if (!roleDoc.exists || roleDoc.data().role !== requiredRole) {
      redirectToLogin();
      return;
    }

    // Authorized
    const blocker = document.getElementById("auth-blocker");
    if (blocker) blocker.style.display = "none";

    const app = document.getElementById("app");
    if (app) app.style.display = "block";
  } catch (err) {
    console.error(err);
    redirectToLogin();
    return;
  }
}

function redirectToLogin() {
  const path = window.location.pathname;
  if (path.includes("/dashboards/")) {
    window.location.replace("../login.html");
  } else {
    window.location.replace("login.html");
  }

  // Authorized → hide blocker and show app
  const blocker = document.getElementById("auth-blocker");
  if (blocker) blocker.style.display = "none";

  const app = document.getElementById("app");
  if (app) app.style.display = "block";
}
