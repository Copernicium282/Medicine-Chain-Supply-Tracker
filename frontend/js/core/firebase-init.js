// Initialize Supabase Client
// This is used for "Heavy" file storage (Images/PDFs) because keeping large binaries in Firestore is expensive and slow.
const SUPABASE_URL = "https://qbqnwlwzklgyrgsyadjl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_f0PSQuQiTXkf4ZX098RUdw_PmMhoh2i";

if (!window.supabase) {
  // console.warn("Supabase UMD not loaded - File upload features may be unavailable.");
} else {
  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
  window.supabase = supabase;
}

// firebase init
const firebaseConfig = {
  apiKey: "AIzaSyAt_vkZ5WQqhtCJNJ-MyDXvOXaZWpNeVTo",
  authDomain: "medchain-tracker-v2.firebaseapp.com",
  projectId: "medchain-tracker-v2",
  storageBucket: "medchain-tracker-v2.firebasestorage.app",
  messagingSenderId: "862514838580",
  appId: "1:862514838580:web:fb59343921ba7abf64de61",
};

if (typeof firebase === "undefined") {
  console.error("Firebase SDK not loaded");
} else {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();

  window.auth = auth;
  window.db = db;

  // Enable Offline Persistence
  // This allows the app to function even if the internet connection drops, syncing data when back online.
  // It effectively turns the browser into a "Local Node" cache.
  try {
    db.enablePersistence &&
      db.enablePersistence().catch((err) => {
        if (err.code === "failed-precondition") {
          console.warn("Firestore persistence failed: multiple tabs open.");
        } else if (err.code === "unimplemented") {
          console.warn(
            "Firestore persistence is not available in this browser."
          );
        }
      });
  } catch (e) {
    console.warn("Persistence setup skipped:", e.message);
  }
}
