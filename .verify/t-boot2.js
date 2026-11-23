const {loadPage} = require('./loader');
(async () => {
  console.log('=== A: module ready BEFORE host boots (fast cache) ===');
  const h = loadPage({configured: true, adminEmails: ['boss@x.com'], moduleFirst: true});
  await h.settle(150);
  h.ok('reaches sign-in without waiting for a callback', !!h.$('[data-action="google-signin"]'));
  h.ok('no setup banner', !h.$('.setup-banner'));

  console.log('\n=== B: unconfigured project ===');
  const h2 = loadPage({configured: false});
  await h2.settle(150);
  h2.ok('shows configuration message, not sign-in', h2.text().includes('ಸಂರಚನೆ ಬಾಕಿ ಇದೆ'));
  h2.ok('does not show sign-in button', !h2.$('[data-action="google-signin"]'));
  h2.ok('banner names the config file', h2.text().includes('js/firebase-config.js'));

  console.log('\n=== C: no module at all (file missing / offline) ===');
  const h3 = loadPage({configured: true, adminEmails: ['boss@x.com'], dropModule: true});
  await h3.settle(150);
  h3.ok('stays in loading, never claims misconfiguration', !h3.text().includes('ಸಂರಚನೆ ಬಾಕಿ ಇದೆ'));
  h3.ok('shows the checking message', h3.text().includes('ಒಂದು ಕ್ಷಣ'));

  console.log('  failures:', h.fails() + h2.fails() + h3.fails());
})();
