/* ============================================================
   Emulator wiring.

   Real Firebase SDKs only:
     - firebase-admin  -> seeds data and creates accounts (bypasses rules,
                          which is exactly what an out-of-band fixture is)
     - firebase (web)  -> every assertion in the suites, through the same
                          modular SDK version index.html loads from the CDN

   Four separate sessions, each its own FirebaseApp and its own signed-in
   user, so no test can accidentally inherit another session's token.
   ============================================================ */

const admin = require('firebase-admin');
const { initializeApp, deleteApp } = require('firebase/app');
const {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} = require('firebase/auth');
const {
  getFirestore,
  connectFirestoreEmulator,
  terminate,
} = require('firebase/firestore');
const { getStorage, connectStorageEmulator } = require('firebase/storage');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-classplus';
const BUCKET = `${PROJECT_ID}.appspot.com`;

function hostPort(value, fallback) {
  const raw = String(value || fallback);
  const clean = raw.replace(/^https?:\/\//, '');
  const [host, port] = clean.split(':');
  return { host: host || '127.0.0.1', port: Number(port) };
}

const FIRESTORE = hostPort(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
const AUTH = hostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
const STORAGE = hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9199');

/* The admin address the COMMITTED rules grant access to. The repository
   still ships the placeholder in all three places; the suite deliberately
   signs the admin in with that exact address so no rule has to be edited
   to make the tests pass. ADMIN_EMAIL is read from js/firebase-config.js
   so the test cannot drift from the shipped config. */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');

function adminEmailFromConfig() {
  const src = fs.readFileSync(path.join(REPO, 'js', 'firebase-config.js'), 'utf8');
  const m = src.match(/window\.ADMIN_EMAILS\s*=\s*\[\s*'([^']+)'/);
  if (!m) throw new Error('could not read ADMIN_EMAILS from js/firebase-config.js');
  return m[1];
}
function adminEmailFromRules(file) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8');
  const m = src.match(/function adminEmail\(\)\s*\{\s*return\s*'([^']+)'/);
  if (!m) throw new Error('could not read adminEmail() from ' + file);
  return m[1];
}

const ADMIN_EMAIL = adminEmailFromConfig();
const PASSWORD = 'emulator-password';

const USERS = {
  admin: { uid: 'adm_boss', email: ADMIN_EMAIL, emailVerified: true },
  approved: { uid: 'stu_approved', email: 'approved.student@example.com', emailVerified: true },
  pending: { uid: 'stu_pending', email: 'pending.student@example.com', emailVerified: true },
  other: { uid: 'stu_other', email: 'other.student@example.com', emailVerified: true },
  fresh: { uid: 'stu_fresh', email: 'fresh.student@example.com', emailVerified: true },
};

let adminApp = null;
const sessions = {};

function adminSdk() {
  if (!adminApp) {
    process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE.host}:${FIRESTORE.port}`;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = `${AUTH.host}:${AUTH.port}`;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${STORAGE.host}:${STORAGE.port}`;
    adminApp = admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  }
  return adminApp;
}

async function createAccounts() {
  adminSdk();
  const auth = admin.auth();
  for (const key of Object.keys(USERS)) {
    const u = USERS[key];
    try {
      await auth.deleteUser(u.uid);
    } catch (e) {
      /* not there yet */
    }
    await auth.createUser({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      password: PASSWORD,
      displayName: key,
    });
  }
}

/* One signed-in client session = one FirebaseApp + one real ID token. */
async function session(key) {
  if (sessions[key]) return sessions[key];
  const u = USERS[key];
  if (!u && key !== 'anon') throw new Error('unknown session ' + key);

  const app = initializeApp(
    {
      apiKey: 'fake-api-key',
      authDomain: 'localhost',
      projectId: PROJECT_ID,
      storageBucket: BUCKET,
      appId: '1:1:web:1',
    },
    'session-' + key
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH.host}:${AUTH.port}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FIRESTORE.host, FIRESTORE.port);
  const storage = getStorage(app);
  connectStorageEmulator(storage, STORAGE.host, STORAGE.port);

  if (key !== 'anon') {
    await signInWithEmailAndPassword(auth, u.email, PASSWORD);
  }

  const s = { key, app, auth, db, storage, uid: key === 'anon' ? null : u.uid, email: key === 'anon' ? '' : u.email };
  sessions[key] = s;
  return s;
}

async function closeAll() {
  for (const key of Object.keys(sessions)) {
    const s = sessions[key];
    try {
      await terminate(s.db);
    } catch (e) {}
    try {
      await deleteApp(s.app);
    } catch (e) {}
    delete sessions[key];
  }
  if (adminApp) {
    try {
      await adminApp.delete();
    } catch (e) {}
    adminApp = null;
  }
}

/* Wipe Firestore between suites through the emulator's own endpoint. */
async function clearFirestore() {
  const url = `http://${FIRESTORE.host}:${FIRESTORE.port}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error('clearFirestore failed: ' + res.status);
}

module.exports = {
  PROJECT_ID,
  BUCKET,
  FIRESTORE,
  AUTH,
  STORAGE,
  ADMIN_EMAIL,
  PASSWORD,
  USERS,
  REPO,
  admin,
  adminSdk,
  adminEmailFromConfig,
  adminEmailFromRules,
  createAccounts,
  session,
  closeAll,
  clearFirestore,
};
