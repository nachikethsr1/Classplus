/* The admin allowlist appears in three files that must agree, and the
   emulator proves what disagreement would cost: the Firestore and Storage
   copies are the ones that actually grant access. */

const { doc, getDoc } = require('firebase/firestore');
const h = require('../harness');
const { session, adminEmailFromConfig, adminEmailFromRules, ADMIN_EMAIL, USERS } = require('../env');

module.exports = async function run() {
  h.setGroup('admin allowlist');

  const cfg = adminEmailFromConfig();
  const fsRules = adminEmailFromRules('firestore.rules');
  const stRules = adminEmailFromRules('storage.rules');

  h.expect('X01', 'js/firebase-config.js and firestore.rules name the same admin', cfg === fsRules, `config=${cfg} firestore.rules=${fsRules}`);
  h.expect('X02', 'firestore.rules and storage.rules name the same admin', fsRules === stRules, `firestore.rules=${fsRules} storage.rules=${stRules}`);

  /* The signed-in admin session in this suite uses exactly the address the
     committed rules grant. Proving admin reads work proves the allowlist is
     wired correctly, whatever address is in it. */
  const boss = await session('admin');
  await h.allow('X03', `the address in the committed rules (${ADMIN_EMAIL}) really is an admin`, () =>
    getDoc(doc(boss.db, 'students/' + USERS.other.uid))
  );

  const placeholder = /replace-with-/i.test(cfg);
  if (placeholder) {
    h.expect(
      'X04',
      'the admin address is a real Google account, not the placeholder',
      false,
      `all three files still say "${cfg}". Until that is replaced, the real administrator has no access in production — ` +
        'the emulator only passes because the suite signs in AS the placeholder address.'
    );
  } else {
    h.expect('X04', 'the admin address is a real Google account, not the placeholder', true);
  }
};
