/* ============================================================
   Realistic loader harness.

   Reproduces the browser's actual execution order:
     - classic <script src>        : executes during parse, in order
     - classic inline <script>     : executes during parse, in order
     - <script type="module" src>  : DEFERRED, executes after parse,
                                     asynchronously, like a real module

   It also models Firestore's real list-query behaviour: a getDocs()
   over a collection is DENIED unless the query provably satisfies the
   read rule. That is what "rules are not filters" means, and it is
   the exact behaviour my earlier stub faked away.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const {JSDOM, VirtualConsole} = require('jsdom');

const REPO = '/home/user/Classplus';

/* ---------- a Firestore double that enforces rules ---------- */
function makeFirestoreDouble(opts){
  const db = opts.db || {};            // path -> doc  (e.g. 'students/u1')
  const fxCtx = {uid: null, isAdmin: false, isApproved: false};  // live auth context
  const calls = {reads: [], writes: []};
  const listeners = [];

  function collectionOf(p){ return p.split('/')[0]; }
  function docsIn(col){
    const out = [];
    Object.keys(db).forEach(function(p){
      const parts = p.split('/');
      if(parts.length === 2 && parts[0] === col){
        const snapData = db[p];
        out.push({id: parts[1], data: function(){ return snapData; }, ref: {path: p}});
      }
    });
    return out;
  }

  /* Which fields does this query constrain? A real Firestore list query
     is allowed only when the rule can be proven for every possible doc. */
  function queryConstraints(q){
    return (q && q.__constraints) || [];
  }

  function listAllowed(col, q){
    const ctx = fxCtx;
    const constraints = queryConstraints(q);

    if(col === 'trainings'){
      if(ctx.isAdmin) return true;
      // rule: isApproved() && published == true && archived != true
      if(!ctx.isApproved) return false;
      const hasPublished = constraints.some(c => c.field === 'published' && c.op === '==' && c.value === true);
      return hasPublished;             // unconstrained scan => DENIED
    }
    if(col === 'submissions'){
      if(ctx.isAdmin) return true;
      if(!ctx.uid) return false;
      // rule: isSelf(resource.data.studentUid)
      const hasOwner = constraints.some(c => c.field === 'studentUid' && c.op === '==' && c.value === ctx.uid);
      return hasOwner;                 // unconstrained scan => DENIED
    }
    if(col === 'certificates'){
      if(ctx.isAdmin) return true;
      if(!ctx.uid) return false;
      const hasOwner = constraints.some(c => c.field === 'studentUid' && c.op === '==' && c.value === ctx.uid);
      return hasOwner;
    }
    if(col === 'students'){
      if(ctx.isAdmin) return true;
      return false;                    // only per-document reads for self
    }
    if(col === 'trainingKeys'){
      return !!ctx.isAdmin;            // admin only, always
    }
    if(col === 'certificateDesigns' || col === 'settings'){
      return !!ctx.uid;                // rule: allow read: if isSignedIn()
    }
    return false;                      // anything else denied
  }

  // mirrors protectedProfileFields() in firestore.rules
  const PROTECTED_PROFILE_FIELDS = ['status','role','verifiedAt','verifiedBy','createdAt','uid','marks','results'];

  function docAllowed(path, mode, incoming){
    const ctx = fxCtx;
    const parts = path.split('/');
    const col = parts[0], id = parts[1];
    const data = db[path];

    if(col === 'students'){
      if(ctx.isAdmin) return true;
      if(ctx.uid !== id) return false;             // self only
      if(mode === 'create'){
        /* mirrors the firestore.rules students create clause: a profile can
           only be born pending, as a student, under the caller's own email */
        const c = incoming || {};
        if(c.uid !== ctx.uid) return false;
        if(!ctx.email || c.email !== ctx.email) return false;
        if(c.status !== 'pending') return false;
        if(c.role !== 'student') return false;
        return true;
      }
      if(mode === 'update' && incoming){
        /* mirrors studentMayUpdateProfile(): protected fields are always
           refused; once approved, kgid and officialName are frozen too. */
        const before = data || {};
        const touched = Object.keys(incoming).filter(function(k){
          return String(before[k]) !== String(incoming[k]);
        });
        if(touched.some(function(k){ return PROTECTED_PROFILE_FIELDS.indexOf(k) !== -1; })) return false;
        if(before.status === 'approved' &&
           touched.some(function(k){ return k === 'kgid' || k === 'officialName'; })) return false;
      }
      return true;
    }
    if(col === 'trainings'){
      if(ctx.isAdmin) return true;
      if(mode === 'create' || mode === 'update' || mode === 'delete') return false;
      return !!(data && ctx.isApproved && data.published === true && data.archived !== true);
    }
    if(col === 'trainingKeys') return !!ctx.isAdmin;
    if(col === 'submissions'){
      if(ctx.isAdmin) return true;
      if(mode === 'update') return false;                        // immutable
      if(mode === 'create'){
        /* mirrors the firestore.rules submissions create clause */
        const c = incoming;
        if(!ctx.isApproved) return false;
        if(!c || c.studentUid !== ctx.uid) return false;
        const NEED = ['studentUid','trainingId','officialNameSnapshot','kgidSnapshot',
                      'feedbackResponses','assessmentAnswers','marksObtained','totalMarks',
                      'percentage','passStatus','submittedAt'];
        if(!NEED.every(function(k){ return Object.prototype.hasOwnProperty.call(c, k); })) return false;
        const tr = db['trainings/' + c.trainingId];
        return !!(tr && tr.published === true);
      }
      return !!(data && data.studentUid === ctx.uid);
    }
    if(col === 'certificates'){
      if(ctx.isAdmin) return true;
      if(mode === 'read') return !!(data && data.studentUid === ctx.uid);
      if(mode === 'delete') return false;
      if(mode === 'create'){
        /* mirrors the firestore.rules certificates create clause:
           self-owned, non-empty number, and the referenced submission must
           exist, belong to the caller, have passed, and its marks/total/pct
           must be copied verbatim from marksObtained/totalMarks/percentage. */
        const c = incoming;
        if(!c) return false;
        if(!ctx.uid || c.studentUid !== ctx.uid) return false;
        if(typeof c.number !== 'string' || !c.number.length) return false;
        const sub = db['submissions/' + c.submissionId];
        if(!sub) return false;
        if(sub.studentUid !== ctx.uid) return false;
        if(sub.passStatus !== true) return false;
        if(c.marks !== sub.marksObtained) return false;
        if(c.total !== sub.totalMarks) return false;
        if(c.pct !== sub.percentage) return false;
        return true;
      }
      return false;
    }
    if(col === 'certificateDesigns') return (mode === 'create' || mode === 'update') ? !!ctx.isAdmin : !!ctx.uid;
    if(col === 'settings') return (mode === 'create' || mode === 'update') ? !!ctx.isAdmin : !!ctx.uid;
    return false;
  }

  function denied(path){
    const e = new Error('Missing or insufficient permissions.');
    e.code = 'permission-denied';
    e.path = path;
    return e;
  }

  const api = {
    calls,
    get ctx(){ return fxCtx; },
    set ctx(v){ Object.assign(fxCtx, v); },
    /* query builder that remembers constraints */
    collection(p){ return {path: p, __col: true}; },
    where(field, op, value){ return {__where: true, field, op, value}; },
    query(col, ...wheres){
      const c = wheres.filter(w => w && w.__where);
      return {path: col.path, __constraints: c};
    },
    orderBy(){ return {__order: true}; },

    getDocs(q){
      const col = collectionOf(q.path);
      calls.reads.push({type: 'list', col, constraints: queryConstraints(q)});
      if(!listAllowed(col, q)) return Promise.reject(denied(col));
      let rows = docsIn(col);
      queryConstraints(q).forEach(function(c){
        rows = rows.filter(function(d){
          const dd = d.data();
          if(c.op === '==') return dd[c.field] === c.value;
          if(c.op === '!=') return dd[c.field] !== c.value;
          return true;
        });
      });
      return Promise.resolve({
        size: rows.length,
        docs: rows,
        forEach(fn){ rows.forEach(fn); }
      });
    },

    getDoc(ref){
      calls.reads.push({type: 'doc', path: ref.path});
      if(!docAllowed(ref.path, 'read')) return Promise.reject(denied(ref.path));
      const d = db[ref.path];
      return Promise.resolve({exists: () => d !== undefined, data: () => d});
    },

    setDoc(ref, data, o){
      calls.writes.push({op: 'set', path: ref.path, data});
      const incoming = (o && o.merge) ? Object.assign({}, db[ref.path], data) : data;
      /* rules treat create and update as separate allow statements */
      const mode = db[ref.path] === undefined ? 'create' : 'update';
      if(!docAllowed(ref.path, mode, incoming)){
        const col = collectionOf(ref.path);
        // a student creating a NEW submission is allowed by the rules;
        // anything else that fails here is a genuine denial
        return Promise.reject(denied(ref.path));
      }
      db[ref.path] = (o && o.merge) ? Object.assign({}, db[ref.path], data) : Object.assign({}, data);
      return Promise.resolve();
    },
    updateDoc(ref, data){
      calls.writes.push({op: 'update', path: ref.path, data});
      if(!docAllowed(ref.path, 'update', Object.assign({}, db[ref.path], data))) return Promise.reject(denied(ref.path));
      db[ref.path] = Object.assign({}, db[ref.path], data);
      return Promise.resolve();
    },
    addDoc(col, data){
      const p = col.path + '/auto' + Math.random().toString(36).slice(2,7);
      return api.setDoc({path: p}, data);
    },
    deleteDoc(ref){
      calls.writes.push({op: 'delete', path: ref.path});
      if(!docAllowed(ref.path, 'delete')) return Promise.reject(denied(ref.path));
      delete db[ref.path];
      return Promise.resolve();
    },
    runTransaction(fn){
      /* A transaction is subject to the same rules as a batch write, and a
         rejection inside it aborts the transaction. Modelled by rejecting on
         the first disallowed write. */
      let failed = null;
      const tx = {
        get: ref => api.getDoc(ref),
        set: (ref, data, o) => {
          const incoming = (o && o.merge) ? Object.assign({}, db[ref.path], data) : data;
          const mode = db[ref.path] === undefined ? 'create' : 'update';
          if(!docAllowed(ref.path, mode, incoming)){ failed = denied(ref.path); return; }
          db[ref.path] = incoming;
          calls.writes.push({op: 'tx-set', path: ref.path, data});
        },
        update: (ref, data) => {
          if(!docAllowed(ref.path, 'update', Object.assign({}, db[ref.path], data))){ failed = denied(ref.path); return; }
          db[ref.path] = Object.assign({}, db[ref.path], data);
          calls.writes.push({op: 'tx-update', path: ref.path, data});
        }
      };
      return Promise.resolve(fn(tx)).then(function(v){
        if(failed) throw failed;
        return v;
      });
    },
    onSnapshot(ref, cb){
      const entry = {path: ref.path, cb};
      listeners.push(entry);
      const d = db[ref.path];
      const exists = d !== undefined;
      if(docAllowed(ref.path, 'read')) cb({exists: () => exists, data: () => d});
      else setTimeout(() => {}, 0);
      return () => { const i = listeners.indexOf(entry); if(i > -1) listeners.splice(i, 1); };
    },
    serverTimestamp(){ return {__ts: true}; },
    Timestamp: {now: () => ({__ts: true})},
    writeBatch(){ return {set(){}, update(){}, commit(){ return Promise.resolve(); }}; },
    storageRef(){}, uploadBytes(){ return Promise.resolve(); }, getDownloadURL(){ return Promise.resolve('x'); },
    deleteObject(){ return Promise.resolve(); },

    /* test helpers */
    push(path, data){ db[path] = data; listeners.filter(l => l.path === path).forEach(function(l){
      l.cb({exists: () => true, data: () => db[path]});
    }); },
    docStore: db,
    listeners
  };
  return api;
}

/* ---------- build a realistic stub of window.FirebaseService ---------- */
function makeServiceStub(fx, opts){
  const state = {
    ready: true,
    configured: opts.configured !== false,
    authReady: opts.configured !== false,
    firestoreReady: opts.configured !== false,
    storageReady: opts.storageReady !== false
  };
  let user = opts.user || null;
  const authListeners = [];
  const svc = {
    get state(){ return state; },
    get user(){ return user; },
    get uid(){ return user ? user.uid : null; },
    get email(){ return user ? user.email : ''; },
    get isSignedIn(){ return !!user; },
    init(){},
    onReady(fn){ fn(state); },
    onAuth(fn){ authListeners.push(fn); fn(user); },
    isAdminEmail(e){
      return (opts.adminEmails || []).map(x => String(x).toLowerCase()).includes(String(e || '').toLowerCase());
    },
    signInWithGoogle(){ return Promise.resolve(); },
    signOut(){
      return Promise.resolve().then(function(){
        user = null; authListeners.forEach(f => f(null)); fx.ctx = {};
      });
    },
    doc(p){ return {path: p}; },
    getDoc: fx.getDoc, setDoc: fx.setDoc, updateDoc: fx.updateDoc, addDoc: fx.addDoc,
    deleteDoc: fx.deleteDoc, collection: fx.collection, where: fx.where, query: fx.query,
    orderBy: fx.orderBy, getDocs: fx.getDocs, runTransaction: fx.runTransaction,
    onSnapshot: fx.onSnapshot, serverTimestamp: fx.serverTimestamp, writeBatch: fx.writeBatch,
    uploadCertificateBg(blob, ext){
      if(opts.uploadFails) return Promise.reject(Object.assign(new Error('denied'), {code:'storage/unauthorized'}));
      return Promise.resolve('https://storage.example/certificate-backgrounds/current.' + (ext||'png'));
    },
    deleteCertificateBg(){ return Promise.resolve(); },
    __setUser(u){ user = u; authListeners.forEach(f => f(u)); }
  };
  return svc;
}

/* ---------- load the page the way a browser would ---------- */
function loadPage(opts){
  opts = opts || {};
  const htmlPath = opts.htmlPath || path.join(REPO, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if(!/Not implemented|Could not parse CSS/.test(e.message)) errs.push('jsdom: ' + e.message); });
  vc.on('error', (...a) => { const s = a.join(' '); if(!/Not implemented/.test(s)) errs.push('console.error: ' + s); });

  const fx = makeFirestoreDouble({db: opts.db || {}, ctx: {}});
  const scriptQueue = [];   // classic scripts, executed in order
  const moduleQueue = [];   // deferred module scripts, executed after parse

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://example.test/',
    virtualConsole: vc,
    beforeParse(w){
      w.scrollTo = () => {};
      w.print = () => { w.__printed = (w.__printed || 0) + 1; };
      w.fetch = () => Promise.resolve({blob: () => Promise.resolve({type: 'image/png', size: 1000})});
      w.FileReader = w.FileReader || function(){};
    }
  });

  const w = dom.window, d = w.document;

  /* install the config globals (that file is a plain classic script) */
  const cfgSrc = fs.readFileSync(path.join(REPO, 'js/firebase-config.js'), 'utf8');
  w.eval(cfgSrc);
  if(opts.adminEmails) w.ADMIN_EMAILS = opts.adminEmails;
  if(opts.configured === false) w.FIREBASE_CONFIG = {apiKey: 'REPLACE_WITH_X'};

  /* queue scripts in document order, respecting module deferral */
  const scripts = [...d.querySelectorAll('script')];
  scripts.forEach(function(s){
    const isModule = s.getAttribute('type') === 'module';
    const src = s.getAttribute('src');
    if(src){
      if(/firebase-service\.js$/.test(src)) moduleQueue.push(src);
      return;
    }
    scriptQueue.push(s.textContent);
  });

  /* A cached module can, in principle, already have executed. Publish it
     before the classic scripts so the host sees it immediately. */
  if(opts.moduleFirst){
    w.FirebaseService = makeServiceStub(fx, opts);
    w.__firebaseServiceLoaded = true;
  }

  /* The app's IIFE closes over its own state, so expose a read-only
     probe the way a test harness normally would. This is appended as a
     classic script AFTER the app, so it runs in the same tick. */
  /* 1. classic scripts run during parse, synchronously, in order.
        The probe is concatenated into the last inline script so it shares
        that script's lexical scope (the app's IIFE state). */
  /* The app's state is inside an IIFE, so the probe is injected inside
     the IIFE's final closing brace rather than appended after it. */
  const PROBE = '\n;window.__probe = {' +
    'setGate:function(v){AUTH.gate=v;},' +
    'setProfile:function(v){AUTH.profile=v;},' +
    'render:function(){render();},' +
    'get gate(){return AUTH.gate;},' +
    'get profile(){return AUTH.profile;},' +
    'get db(){return DB;},' +
    'get state(){return state;},' +
    'get accounts(){return ACCOUNTS;},' +
    'get dataStore(){return DataStore;},' +
    'get remoteCert(){return REMOTE_CERT;},' +
    /* drives the app's real submit -> number -> certificate chain */
    /* Mirrors whatever submitAssessment() does after scoring, so the test
       exercises the real writers with the real shapes. */
    'issueCertificate:function(training, answers, feedback, details, result){' +
      'const r = result || computeResult(training, answers);' +
      'const det = details || {name:"ಅನನ್ಯಾ", kgid:"K1", email:"a@x.com"};' +
      'const fb = feedback || {ratings:{}, answers:{}};' +
      'const u = currentUser() || {};' +
      'return submitAssessmentToFirestore(training, answers, fb, det, r)' +
        '.then(function(res){' +
          'const submission = {id:res.id, userId:u.id, trainingId:training.id,' +
            'trainingTitle:training.title, trainingTopic:training.topic, trainingDate:training.date,' +
            'details:{name:det.name||u.name, email:det.email||"", kgid:det.kgid||""},' +
            'feedback:deepCopy(fb), answers:deepCopy(answers), result:r};' +
          'if(!r.passed) return {id:res.id, certNo:null, result:r, submission:submission};' +
          'return nextCertificateNumberRemote().then(function(certNo){' +
            'return saveCertificateToFirestore(submission, certNo)' +
              '.then(function(){ return attachCertificateNumber(res.id, certNo); })' +
              '.then(function(){ return {id:res.id, certNo:certNo, result:r, submission:submission}; });' +
          '});' +
        '});' +
    '},' +
    'computeResult:function(t, a){ return computeResult(t, a); },' +
    'get answers(){ return ANSWERS; },' +
    'nextCertNo:function(){ return nextCertificateNumberRemote(); },' +
    'localCertNo:function(){ return nextCertificateNumber(); },' +
    'seed:function(){ return publishDefaultTrainingIfEmpty(); },' +
    'scoringMode:function(){ return SCORING.mode; },' +
    'forceServerScoring:function(){ SCORING.mode="server"; },' +
    'forceClientScoring:function(){ SCORING.mode="client"; },' +
    'saveTrainingKey:function(id, key){ return saveTrainingKeyDoc(id, key); },' +
    'reloadDraft:function(){ state.draft = readDraft() || newDraft(currentUser()||{}); render(); return state.draft; },' +
    'setStage:function(n){ state.stage=n; state.route="workflow"; render(); },' +
    'openTraining:function(id){ state.trainingId=id; state.stage=0; state.draft={details:{},answers:{},feedback:{ratings:{},answers:{}}}; render(); return true; },' +
    'submitRegistrationForm:function(){ return submitRegistration(document.querySelector("form[data-form=register]")); }' +
    '};';

  scriptQueue.forEach(function(code, i){
    const isLast = (i === scriptQueue.length - 1);
    if(isLast){
      /* inject just before the IIFE's closing "})();" so the probe can
         reach the private state the app closes over */
      const marker = '\n})();';
      const at = code.lastIndexOf(marker);
      if(at > -1){
        code = code.slice(0, at) + PROBE + code.slice(at);
      }else{
        code = code + PROBE;
      }
    }
    try { w.eval(code); }
    catch(e){ errs.push('script error: ' + e.message); }
  });

  /* 2. modules run AFTER parse: the stub publishes window.FirebaseService
        only at this point, exactly like the real ES module */
  if(opts.dropModule) moduleQueue.length = 0;

  moduleQueue.forEach(function(){
    const svc = makeServiceStub(fx, opts);
    w.FirebaseService = svc;
    /* The real module ends init() with announceReady(), which sets
       __firebaseServiceLoaded and invokes __firebaseServiceReady once.
       Model exactly that, asynchronously like a real module. */
    setTimeout(function(){
      w.__firebaseServiceLoaded = true;
      const cb = w.__firebaseServiceReady;
      if(typeof cb === 'function'){
        w.__firebaseServiceReady = null;
        cb(w.FirebaseService);
      }
    }, 0);
  });

  const $ = s => d.querySelector(s);
  const $$ = s => [...d.querySelectorAll(s)];
  const click = el => { if(!el) throw new Error('missing click target'); el.dispatchEvent(new w.MouseEvent('click', {bubbles: true})); return el; };
  const set = (el, v, evs) => {
    if(!el) throw new Error('missing input');
    el.value = v;
    (evs || ['input']).forEach(e => el.dispatchEvent(new w.Event(e, {bubbles: true})));
  };
  const text = () => {
    const clone = d.body.cloneNode(true);
    clone.querySelectorAll('script,style').forEach(n => n.remove());
    return clone.textContent;
  };
  let fails = 0;
  const ok = (n, c, x) => {
    console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x ? '  [' + x + ']' : ''));
    if(!c) fails++;
  };

  return {
    w, d, $, $$, click, set, text, ok, fx, errs,
    fails: () => fails,
    get db(){ return w.__probe ? w.__probe.db : null; },
    get gate(){ return w.__probe ? w.__probe.gate : null; },
    signIn(u){
      /* Mirror the rules: isApproved() is a server-side read of the
         caller's own profile document. */
      const prof = fx.docStore['students/' + u.uid];
      fx.ctx = {
        uid: u.uid,
        email: u.email || '',
        isAdmin: (opts.adminEmails || []).map(x => x.toLowerCase())
                   .includes(String(u.email || '').toLowerCase()),
        isApproved: !!(prof && prof.status === 'approved')
      };
      w.FirebaseService.__setUser(u);
    },
    setApproved(v){ fx.ctx.isApproved = !!v; },
    push: (p, v) => fx.push(p, v),
    /* the moment a real browser would fire the module's ready callback */
    settle: (ms) => new Promise(r => setTimeout(r, ms || 80))
  };
}

module.exports = {loadPage, makeFirestoreDouble};
