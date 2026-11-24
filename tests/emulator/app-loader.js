/* ============================================================
   Runs index.html's OWN code against the real emulator.

   The point of this file is that nothing re-implements a Firestore
   rule and nothing re-implements a query. index.html is loaded in
   jsdom exactly as a browser parses it (classic scripts in order,
   the ES module deferred until after the parse), and the
   window.FirebaseService it talks to is a thin adapter over the real
   modular Firebase SDK pointed at the emulator — the same surface
   js/firebase-service.js publishes, built from the same SDK version.

   So when loadTrainingsForStudent() runs here, a real constrained
   query goes to the real Firestore emulator and the real
   firestore.rules decide the answer.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const {
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where,
  orderBy, limit, onSnapshot, serverTimestamp, Timestamp, writeBatch, getDocs,
  runTransaction,
} = require('firebase/firestore');
const { ref: storageRef, uploadBytes, getDownloadURL, deleteObject } = require('firebase/storage');

const { REPO, ADMIN_EMAIL } = require('./env');

/* jsdom runs page code in its own realm, so a `{}` built by index.html is
   not `instanceof Object` here and the Firestore SDK rejects it ("Data must
   be an object, but it was: a custom Object object"). A browser has one
   realm and never sees this. Rebuild plain objects/arrays in this realm and
   pass everything else (FieldValue sentinels, Timestamps, Blobs) straight
   through. */
function isPlainish(v) {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === null || Object.getPrototypeOf(p) === null;
}
function fromPageRealm(v) {
  if (Array.isArray(v)) {
    /* .map() on a cross-realm array returns another cross-realm array
       (ArraySpeciesCreate), and the SDK tests `input instanceof Array`. */
    const out = [];
    for (let i = 0; i < v.length; i++) out.push(fromPageRealm(v[i]));
    return out;
  }
  if (Object.prototype.toString.call(v) === '[object Date]') return new Date(v.getTime());
  if (isPlainish(v)) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = fromPageRealm(v[k]);
    return out;
  }
  return v;
}

/* The public surface of js/firebase-service.js, backed by a real session. */
function makeRealService(sess, opts) {
  const o = opts || {};
  const authListeners = [];
  const readyListeners = [];
  const state = {
    ready: true,
    configured: true,
    app: sess.app,
    auth: sess.auth,
    db: sess.db,
    storage: sess.storage,
    user: null,
    error: null,
    authReady: true,
    firestoreReady: true,
    storageReady: o.storageReady !== false,
  };

  const svc = {
    get state() { return state; },
    get user() { return state.user; },
    get uid() { return state.user ? state.user.uid : null; },
    get email() { return state.user ? state.user.email || '' : ''; },
    get isSignedIn() { return !!state.user; },

    onAuth(fn) { authListeners.push(fn); if (state.ready) fn(state.user); return () => {}; },
    onReady(fn) { readyListeners.push(fn); if (state.ready) fn(state); },

    signInWithGoogle() { return Promise.resolve(); },
    signOut() { state.user = null; authListeners.forEach((f) => f(null)); return Promise.resolve(); },

    doc: (p) => doc(sess.db, p),
    getDoc: (r) => getDoc(r),
    setDoc: (r, data, o2) => setDoc(r, fromPageRealm(data), o2 ? fromPageRealm(o2) : {}),
    updateDoc: (r, data) => updateDoc(r, fromPageRealm(data)),
    addDoc: (c, data) => addDoc(c, fromPageRealm(data)),
    deleteDoc: (r) => deleteDoc(r),
    collection: (p) => collection(sess.db, p),
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    writeBatch: () => writeBatch(sess.db),
    getDocs,
    /* the transaction object handed to page code writes page-realm
       objects too, so wrap set/update the same way (see fromPageRealm) */
    runTransaction: (fn) =>
      runTransaction(sess.db, (tx) =>
        fn({
          get: (r) => tx.get(r),
          set: (r, data, opts) => (opts === undefined ? tx.set(r, fromPageRealm(data)) : tx.set(r, fromPageRealm(data), fromPageRealm(opts))),
          update: (r, data) => tx.update(r, fromPageRealm(data)),
          delete: (r) => tx.delete(r),
        })
      ),

    async uploadCertificateBg(blob, ext) {
      if (!state.storageReady) throw new Error('storage-not-ready');
      const p = 'certificate-backgrounds/current.' + (ext || 'png');
      const r = storageRef(sess.storage, p);
      await uploadBytes(r, blob, { contentType: (blob && blob.type) || 'image/png' });
      return getDownloadURL(r);
    },
    async deleteCertificateBg(ext) {
      if (!state.storageReady) return;
      try {
        await deleteObject(storageRef(sess.storage, 'certificate-backgrounds/current.' + (ext || 'png')));
      } catch (e) {}
    },

    isAdminEmail(email) {
      const list = (global.__ADMIN_EMAILS__ || []).map((e) => String(e).toLowerCase().trim());
      return list.indexOf(String(email || '').toLowerCase().trim()) > -1;
    },

    /* test-only */
    __setUser(u) {
      state.user = u;
      authListeners.forEach((f) => f(u));
    },
  };
  return svc;
}

const PROBE =
  '\n;window.__probe = {' +
  'get gate(){return AUTH.gate;},' +
  'get profile(){return AUTH.profile;},' +
  'get db(){return DB;},' +
  'get state(){return state;},' +
  'get dataStore(){return DataStore;},' +
  'get accounts(){return ACCOUNTS;},' +
  'get answers(){return ANSWERS;},' +
  'scoringMode:function(){return SCORING.mode;},' +
  'reload:function(){return reloadPortalData();},' +
  'loadPortal:function(f){return loadPortalData(f);},' +
  'loadStudents:function(){return loadStudentAccounts(true);},' +
  'seed:function(){return publishDefaultTrainingIfEmpty();},' +
  'computeResult:function(t,a){return computeResult(t,a);},' +
  'nextCertNo:function(){return nextCertificateNumberRemote();},' +
  'localCertNo:function(){return nextCertificateNumber();},' +
  'saveTraining:function(d){return saveTrainingToFirestore(d);},' +
  'setPublished:function(id,p){return setTrainingPublished(id,p);},' +
  'setStatus:function(uid,s){return setStudentStatus(uid,s);},' +
  'saveDesign:function(d,u){return saveCertDesignRemote(d,u);},' +
  'persistDesign:function(design,bg){certDesState.design=design;certDesState.bg=bg;return persistCertDesign();},' +
  'readDesign:function(){return loadCertDesignRemote();},' +
  'get certDesState(){return certDesState;},' +
  'computeResultWithKey:function(t,a,k){return computeResult(t,a,k);},' +
  'fetchKey:function(id){return fetchAnswerKeyForTraining(id);},' +
  /* the real hand-in -> key release -> marking -> number -> certificate
     chain, exactly as submitAssessment() runs it in the browser */
  'issueCertificate:function(training, answers, details){' +
  'const det = details || {name:"ಅನನ್ಯಾ", kgid:"KG-1001", email:""};' +
  'const fb = {ratings:{}, answers:{}};' +
  'const u = currentUser() || {};' +
  'return submitAssessmentToFirestore(training, answers, fb, det).then(function(res){' +
  'return fetchAnswerKeyForTraining(training.id).then(function(key){' +
  'const r = computeResult(training, answers, key);' +
  'return (res.alreadyScored ? Promise.resolve(null) : scoreSubmissionInFirestore(res.id, r)).then(function(){' +
  'const submission = {id:res.id, userId:u.id, trainingId:training.id,' +
  'trainingTitle:training.title, trainingTopic:training.topic, trainingDate:training.date,' +
  'details:{name:det.name, email:det.email||"", kgid:det.kgid||""},' +
  'feedback:fb, answers:answers, result:r};' +
  'if(!r.passed) return {id:res.id, certNo:null, result:r};' +
  'return nextCertificateNumberRemote().then(function(certNo){' +
  'return saveCertificateToFirestore(submission, certNo)' +
  '.then(function(){ return attachCertificateNumber(res.id, certNo); })' +
  '.then(function(){ return {id:res.id, certNo:certNo, result:r}; });' +
  '});' +
  '});' +
  '});' +
  '});' +
  '}' +
  '};';

/* Load index.html the way a browser does. */
function loadApp(options) {
  const opts = options || {};
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const warnings = [];
  const errors = [];

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (!/Not implemented|Could not parse CSS/.test(e.message)) errors.push('jsdom: ' + e.message);
  });
  vc.on('error', (...a) => {
    const s = a.join(' ');
    if (!/Not implemented/.test(s)) errors.push('console.error: ' + s);
  });
  vc.on('warn', (...a) => warnings.push(a.join(' ')));

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost:8000/',
    virtualConsole: vc,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.print = () => {};
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
      w.fetch = (...a) => fetch(...a);
    },
  });

  const w = dom.window;
  const d = w.document;

  /* js/firebase-config.js is a classic script: run the real file, then
     point it at the emulator project. ADMIN_EMAILS keeps the committed
     value so the UI and the rules agree. */
  w.eval(fs.readFileSync(path.join(REPO, 'js', 'firebase-config.js'), 'utf8'));
  w.FIREBASE_CONFIG = {
    apiKey: 'fake-api-key',
    authDomain: 'localhost',
    projectId: process.env.GCLOUD_PROJECT || 'demo-classplus',
    storageBucket: (process.env.GCLOUD_PROJECT || 'demo-classplus') + '.appspot.com',
    messagingSenderId: '1',
    appId: '1:1:web:1',
  };
  w.firebaseIsConfigured = true;
  global.__ADMIN_EMAILS__ = w.ADMIN_EMAILS;

  /* classic scripts, in document order; module scripts are deferred */
  const classic = [];
  let hasModule = false;
  [...d.querySelectorAll('script')].forEach((s) => {
    const isModule = s.getAttribute('type') === 'module';
    const src = s.getAttribute('src');
    if (src) {
      if (isModule) hasModule = true;
      return; /* js/firebase-config.js already evaluated above */
    }
    if (!isModule) classic.push(s.textContent);
  });

  classic.forEach((code, i) => {
    if (i === classic.length - 1) {
      const marker = '\n})();';
      const at = code.lastIndexOf(marker);
      code = at > -1 ? code.slice(0, at) + PROBE + code.slice(at) : code + PROBE;
    }
    try {
      w.eval(code);
    } catch (e) {
      errors.push('script error: ' + e.message);
    }
  });

  return {
    w,
    d,
    errors,
    warnings,
    hasModule,
    get probe() { return w.__probe; },
    get gate() { return w.__probe && w.__probe.gate; },
    /* the module finishing: exactly what announceReady() does */
    publishService(svc) {
      w.FirebaseService = svc;
      w.__firebaseServiceLoaded = true;
      const cb = w.__firebaseServiceReady;
      if (typeof cb === 'function') {
        w.__firebaseServiceReady = null;
        cb(svc);
      }
    },
    settle: (ms) => new Promise((r) => setTimeout(r, ms || 150)),
    text() {
      const clone = d.body.cloneNode(true);
      clone.querySelectorAll('script,style').forEach((n) => n.remove());
      return clone.textContent;
    },
  };
}

module.exports = { loadApp, makeRealService, ADMIN_EMAIL };
