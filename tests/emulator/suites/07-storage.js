/* storage.rules — certificate background artwork.

   Real Storage SDK calls against the Storage emulator, which evaluates the
   committed storage.rules with the official rules runtime. */

const { ref, uploadBytes, getBytes, getMetadata, deleteObject } = require('firebase/storage');
const h = require('../harness');
const { session } = require('../env');

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

module.exports = async function run() {
  h.setGroup('storage.rules');

  const anon = await session('anon');
  const me = await session('approved');
  const boss = await session('admin');

  const path = 'certificate-backgrounds/current.png';

  /* ---- writing ---- */
  await h.allow('B01', 'admin uploads the certificate background (PNG)', () =>
    uploadBytes(ref(boss.storage, path), PNG, { contentType: 'image/png' })
  );
  await h.allow('B02', 'admin replaces the background with a JPEG', () =>
    uploadBytes(ref(boss.storage, 'certificate-backgrounds/current.jpg'), PNG, { contentType: 'image/jpeg' })
  );
  await h.deny('B03', 'student uploads a certificate background', () =>
    uploadBytes(ref(me.storage, path), PNG, { contentType: 'image/png' })
  );
  await h.deny('B04', 'signed-out visitor uploads a certificate background', () =>
    uploadBytes(ref(anon.storage, path), PNG, { contentType: 'image/png' })
  );
  await h.deny('B05', 'admin uploads a non-image (PDF) as the background', () =>
    uploadBytes(ref(boss.storage, 'certificate-backgrounds/current.pdf'), PNG, { contentType: 'application/pdf' })
  );
  await h.deny('B06', 'admin uploads an image over the 5 MB ceiling', () =>
    uploadBytes(ref(boss.storage, 'certificate-backgrounds/big.png'), Buffer.alloc(6 * 1024 * 1024, 1), {
      contentType: 'image/png',
    })
  );
  await h.deny('B07', 'admin writes outside certificate-backgrounds/', () =>
    uploadBytes(ref(boss.storage, 'private/secret.png'), PNG, { contentType: 'image/png' })
  );

  /* ---- reading ---- */
  await h.allow('B08', 'signed-in student reads the background (certificate must render)', () =>
    getBytes(ref(me.storage, path))
  );
  await h.allow('B09', 'signed-in student reads the background metadata', () =>
    getMetadata(ref(me.storage, path))
  );
  await h.deny('B10', 'signed-out visitor reads the background', () => getBytes(ref(anon.storage, path)));
  await h.deny('B11', 'student reads outside certificate-backgrounds/', () =>
    getBytes(ref(me.storage, 'private/secret.png'))
  );

  /* ---- deleting ----
     resetCertDesignRemote() / deleteCertificateBg() in index.html call
     deleteObject(). An admin must be able to remove the artwork. */
  await h.deny('B12', 'student deletes the certificate background', () => deleteObject(ref(me.storage, path)));
  await h.allow('B13', 'admin deletes the certificate background (deleteCertificateBg)', () =>
    deleteObject(ref(boss.storage, 'certificate-backgrounds/current.jpg'))
  );
};
