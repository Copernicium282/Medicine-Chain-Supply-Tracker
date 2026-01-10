/**
 * Handles the login process using Firebase Auth.
 *
 * Why: We persist the session locally so users stay logged in.
 * After Auth, we MUST check the 'roles' collection to enforce
 * Manufacturer/Distributor/Pharmacy access policies.
 */
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const loginBtn = document.getElementById("loginBtn");

  if (loginBtn) loginBtn.disabled = true;

  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    const credential = await auth.signInWithEmailAndPassword(email, password);
    const uid = credential.user.uid;

    // Fetch role from unified role store
    // We do not rely on Custom Claims (Firebase Admin) because we need the same role logic
    // to work for MetaMask users who don't have a Firebase User object.
    const roleDoc = await db.collection("roles").doc(uid).get();

    if (!roleDoc.exists) {
      alert("Role not found. Contact admin.");
      await auth.signOut();
      return;
    }

    const role = roleDoc.data().role;

    window.location.href = `dashboards/${role}-dashboard.html`;
  } catch (error) {
    alert(`Login failed: ${error.message}\n Please try again.`);
  } finally {
    if (loginBtn) loginBtn.disabled = false;
  }
}
