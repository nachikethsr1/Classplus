const {loadPage} = require('./loader');
(async () => {
  console.log('=== Does the app recover once the module is ready? ===');
  const h = loadPage({configured: true, adminEmails: ['boss@x.com']});
  console.log('immediately after parse — gate should be loading/config, NOT stuck:');
  console.log('  text has setup-pending?', h.text().includes('ಸಂರಚನೆ ಬಾಕಿ ಇದೆ'));

  await h.settle(150);   // module becomes ready here

  const stuck = h.text().includes('ಸಂರಚನೆ ಬಾಕಿ ಇದೆ');
  h.ok('app leaves the setup-pending screen after module ready', !stuck,
       stuck ? 'STILL STUCK — bootAuth ran before FirebaseService existed' : 'recovered');
  h.ok('sign-in card appears', !!h.$('[data-action="google-signin"]'));
  console.log('  errors:', h.errs.length ? h.errs : 'none');
  console.log('  failures:', h.fails());
})();
