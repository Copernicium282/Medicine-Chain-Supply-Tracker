async function signup() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const role = document.getElementById("role").value;
  const signupBtn = document.getElementById("signupBtn");

  if (signupBtn) signupBtn.disabled = true;

  // basic validation
  if (!email || !password || !role) {
    alert("All fields are required.");
    if (signupBtn) signupBtn.disabled = false;
    return;
  }

  // Explicit Role Whitelist
  // We strictly validate inputs against a hardcoded list to prevent
  // malicious users from inspecting the DOM and trying to inject "super_admin" or other roles.
  const validRoles = ["manufacturer", "distributor", "pharmacy", "admin"];
  if (!validRoles.includes(role)) {
    alert("Invalid role selected.");
    if (signupBtn) signupBtn.disabled = false;
    return;
  }

  try {
    // persist auth for not getting logged out due to page reload
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    const credential = await auth.createUserWithEmailAndPassword(
      email,
      password
    );
    const uid = credential.user.uid;

    // unified role store
    await db.collection("roles").doc(uid).set({
      role: role,
      type: "firebase",
      createdAt: new Date(),
    });

    alert("User registered successfully!");

    window.location.href = `dashboards/${role}-dashboard.html`;
  } catch (error) {
    alert(error.message);
  } finally {
    if (signupBtn) signupBtn.disabled = false;
  }
}
