/* ============================================================
   FIREBASE CONFIGURATION
   ------------------------------------------------------------
   This file holds the PUBLIC web configuration for your Firebase
   project. These values are not secrets — Firebase expects them to
   ship in the browser. Access control is enforced by Firestore and
   Storage Security Rules, never by these values.

   NEVER put any of the following in this file:
     - service account JSON
     - private keys
     - Admin SDK credentials
     - any "server key" or API secret

   ------------------------------------------------------------
   HOW TO FILL THIS IN
   ------------------------------------------------------------
   1. Go to https://console.firebase.google.com  ->  create a project
      (or open the existing one).
   2. In the left sidebar click the gear icon  ->  Project settings.
   3. Scroll to "Your apps". If there is no web app, click the web
      icon ( </> ) and register one. Nickname it anything, e.g.
      "DTI Bengaluru portal". Do NOT tick Firebase Hosting if you
      plan to stay on Netlify (either works; Netlify is fine).
   4. Firebase shows you a `firebaseConfig` object. Copy its six
      values into the placeholders below.
   5. Enable the products listed under FIREBASE_SETUP below.

   Until real values are supplied, every placeholder still starts
   with the literal text REPLACE_WITH_ and the app refuses to start
   Firebase, showing a clear configuration message instead of
   failing silently.
   ============================================================ */

/* ------------------------------------------------------------
   FIREBASE_SETUP — the console checklist.
   Each phase reads flags from here to decide whether the
   corresponding feature is available yet.
   ------------------------------------------------------------ */
window.FIREBASE_SETUP = {
  /* Phase 3 needs Authentication -> Sign-in method -> Google = Enabled */
  authEnabled: true,

  /* Phase 6 needs Firestore Database created (production mode) */
  firestoreEnabled: true,

  /* Phase 9 needs Storage enabled; bucket URL goes in storageBucket below */
  storageEnabled: true,

  /* Show a persistent banner while this is true, so nobody mistakes
     the site for a finished production system before go-live. */
  showSetupBanner: true
};

/* ------------------------------------------------------------
   The public web app configuration.
   Replace every REPLACE_WITH_... string with the value Firebase
   printed for your web app. Do not change the key names.
   ------------------------------------------------------------ */
window.FIREBASE_CONFIG = {
  apiKey:            'REPLACE_WITH_WEB_API_KEY',
  authDomain:        'REPLACE_WITH_PROJECT_ID.firebaseapp.com',
  projectId:         'REPLACE_WITH_PROJECT_ID',
  storageBucket:     'REPLACE_WITH_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'REPLACE_WITH_MESSAGING_SENDER_ID',
  appId:             'REPLACE_WITH_WEB_APP_ID'
};

/* ------------------------------------------------------------
   Which Google account is the administrator.

   This is a CONVENIENCE for the UI only (showing the admin nav).
   The real gate is the Firestore Security Rule in firestore.rules,
   which must list the same address. Changing this array alone grants
   nobody any database access — the rules are what matter.

   Use the exact Google account your mother will sign in with.
   Keep this list and the rules list in sync; the setup guide in
   FIREBASE_SETUP.md explains how.
   ------------------------------------------------------------ */
window.ADMIN_EMAILS = [
  'replace-with-admin-google-account@gmail.com'
];

/* ------------------------------------------------------------
   True when the placeholders above have been replaced.
   ------------------------------------------------------------ */
window.firebaseIsConfigured = (function () {
  const c = window.FIREBASE_CONFIG || {};
  return Object.keys(c).every(function (k) {
    const v = String(c[k] || '');
    return v && v.indexOf('REPLACE_WITH_') === -1;
  }) && (window.ADMIN_EMAILS || []).every(function (e) {
    return e && e.indexOf('replace-with-') === -1;
  });
})();
