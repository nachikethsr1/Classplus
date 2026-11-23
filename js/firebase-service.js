/* ============================================================
   FIREBASE SERVICE LAYER
   ------------------------------------------------------------
   Thin wrapper over the modular Firebase Web SDK (v10+), loaded
   from the official CDN as an ES module. No bundler, no Node
   server, works as a static site on Netlify.

   Responsibilities of this file, and nothing else:
     - initialise the Firebase app
     - expose auth state as an event
     - expose small helpers: sign in with Google, sign out,
       listen to a document, listen to a collection, write docs

   All business logic (what a submission contains, how marks are
   calculated, which trainings exist) stays in index.html so the
   existing design and flow are untouched.
   ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  getDocs,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

const FB = {
  ready: false,
  configured: false,
  app: null,
  auth: null,
  db: null,
  storage: null,
  user: null,
  error: null,

  /* true when both the config placeholders were replaced and the
     project settings say the products are turned on */
  authReady: false,
  firestoreReady: false,
  storageReady: false,

  /* firestore + storage primitives, re-exported for index.html */
  api: null
};

/* ------------------------------------------------------------
   Listeners registered by index.html
   ------------------------------------------------------------ */
const authListeners = [];
const readyListeners = [];

function emitAuth(user) {
  FB.user = user;
  authListeners.forEach(function (fn) {
    try { fn(user); } catch (e) { console.error('[fb] auth listener failed', e); }
  });
}
function emitReady() {
  readyListeners.forEach(function (fn) {
    try { fn(FB); } catch (e) { console.error('[fb] ready listener failed', e); }
  });
}

/* ------------------------------------------------------------
   init
   ------------------------------------------------------------ */
function init() {
  const cfg = window.FIREBASE_CONFIG;
  const setup = window.FIREBASE_SETUP || {};

  if (!window.firebaseIsConfigured) {
    FB.configured = false;
    FB.error = 'not-configured';
    console.warn(
      '[fb] Firebase is not configured yet.\n' +
      'Open js/firebase-config.js and replace the REPLACE_WITH_... values\n' +
      'with the web config from Firebase Console > Project settings > Your apps.\n' +
      'See FIREBASE_SETUP.md for the full checklist.'
    );
    FB.ready = true;
    emitReady();
    return;
  }

  FB.configured = true;

  try {
    FB.app = initializeApp(cfg);
  } catch (e) {
    FB.error = 'init-failed';
    console.error('[fb] initializeApp failed', e);
    FB.ready = true;
    emitReady();
    return;
  }

  /* ---- Auth ---- */
  if (setup.authEnabled !== false) {
    try {
      FB.auth = getAuth(FB.app);
      setPersistence(FB.auth, browserLocalPersistence).catch(function () {
        /* private-mode browsers may refuse; session persistence then applies */
      });
      FB.authReady = true;

      onAuthStateChanged(FB.auth, function (user) {
        emitAuth(user);
      });

      /* completes a redirect-based sign-in if one was started */
      getRedirectResult(FB.auth).catch(function (e) {
        console.warn('[fb] getRedirectResult', e && e.code);
      });
    } catch (e) {
      console.error('[fb] auth init failed', e);
    }
  }

  /* ---- Firestore ---- */
  if (setup.firestoreEnabled !== false) {
    try {
      FB.db = getFirestore(FB.app);
      FB.firestoreReady = true;
    } catch (e) {
      console.error('[fb] firestore init failed', e);
    }
  }

  /* ---- Storage ---- */
  if (setup.storageEnabled !== false) {
    try {
      FB.storage = getStorage(FB.app);
      FB.storageReady = true;
    } catch (e) {
      console.error('[fb] storage init failed', e);
    }
  }

  FB.api = {
    doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
    collection, query, where, orderBy, limit, onSnapshot,
    serverTimestamp, Timestamp, writeBatch, getDocs, runTransaction,
    storageRef, uploadBytes, getDownloadURL, deleteObject
  };

  FB.ready = true;
  emitReady();
}

/* ------------------------------------------------------------
   Auth helpers
   ------------------------------------------------------------ */
function signInWithGoogle() {
  if (!FB.authReady) {
    return Promise.reject(new Error('auth-not-ready'));
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  return signInWithPopup(FB.auth, provider).catch(function (err) {
    /* Popups are blocked in some in-app browsers and on some mobile
       setups; fall back to a full-page redirect. */
    const code = (err && err.code) || '';
    if (code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/cancelled-popup-request') {
      return signInWithRedirect(FB.auth, provider);
    }
    throw err;
  });
}

function signOutUser() {
  if (!FB.authReady) return Promise.resolve();
  return signOut(FB.auth);
}

/* ------------------------------------------------------------
   Public surface
   ------------------------------------------------------------ */
window.FirebaseService = {
  /* state */
  get state() { return FB; },
  get user() { return FB.user; },
  get uid() { return FB.user ? FB.user.uid : null; },
  get email() { return FB.user ? (FB.user.email || '') : ''; },
  get isSignedIn() { return !!FB.user; },

  /* lifecycle */
  init: init,
  onAuth: function (fn) { authListeners.push(fn); if (FB.ready) fn(FB.user); return function () {
    const i = authListeners.indexOf(fn); if (i > -1) authListeners.splice(i, 1);
  }; },
  onReady: function (fn) { readyListeners.push(fn); if (FB.ready) fn(FB); },

  /* auth */
  signInWithGoogle: signInWithGoogle,
  signOut: signOutUser,

  /* convenience wrappers, all null-safe when Firebase is off */
  doc: function (path) { return doc(FB.db, path); },
  getDoc: function (ref) { return getDoc(ref); },
  setDoc: function (ref, data, opts) { return setDoc(ref, data, opts || {}); },
  updateDoc: function (ref, data) { return updateDoc(ref, data); },
  addDoc: function (col, data) { return addDoc(col, data); },
  collection: function (path) { return collection(FB.db, path); },
  query: query,
  where: where,
  orderBy: orderBy,
  onSnapshot: onSnapshot,
  serverTimestamp: serverTimestamp,
  writeBatch: function () { return writeBatch(FB.db); },
  getDocs: getDocs,
  runTransaction: function (fn) { return runTransaction(FB.db, fn); },
  deleteDoc: function (ref) { return deleteDoc(ref); },

  /* storage */
  uploadCertificateBg: async function (blob, ext) {
    if (!FB.storageReady) throw new Error('storage-not-ready');
    const path = 'certificate-backgrounds/current.' + (ext || 'png');
    const r = storageRef(FB.storage, path);
    await uploadBytes(r, blob, { contentType: blob.type || 'image/png' });
    return getDownloadURL(r);
  },
  deleteCertificateBg: async function (ext) {
    if (!FB.storageReady) return;
    try { await deleteObject(storageRef(FB.storage, 'certificate-backgrounds/current.' + (ext || 'png'))); }
    catch (e) { /* already gone */ }
  },

  /* admin detection — UI ONLY. Firestore rules are the real gate. */
  isAdminEmail: function (email) {
    const list = (window.ADMIN_EMAILS || []).map(function (e) { return String(e).toLowerCase().trim(); });
    return list.indexOf(String(email || '').toLowerCase().trim()) > -1;
  }
};

/* start as soon as the module is parsed */
init();
