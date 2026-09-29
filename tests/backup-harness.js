// End-to-end harness for backup.js (node). Stubs chrome + the backup page DOM,
// then drives the REAL doImportFile / buildPayload / downloadBlob path.
let saved = null;
global.chrome = {
  runtime: { getManifest: () => ({ version: '1.11.1' }) },
  storage: {
    local: {
      get: (_k, cb) => cb({}),
      set: (obj, cb) => { saved = JSON.parse(JSON.stringify(obj)); cb && cb(); }
    }
  }
};
global.document = {
  getElementById: (id) => {
    if (id === 'replaceRules') return { checked: true };      // replace mode ON
    if (id === 'status') return { textContent: '', className: '' };
    if (id === 'exportAuto') return { checked: true };
    if (id === 'ver') return { textContent: '' };
    return null;
  }
};
const path = require('path');
const B = require(path.join(__dirname, '..', 'backup.js'));
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };

(async () => {
  // ---------- EXPORT round trip: populate -> payload -> JSON-file bytes ----------
  B.data.channels = ['@science', 'UCalOLlzkH7sAQ1GXoQrqQ_Q'];
  B.data.keywords = ['prank', '/^skibidi\\s/i', '(a+)+', 'shocking'];
  B.data.whitelistChannels = ['@veritasium'];
  B.data.huntMode = true;
  const backupText = JSON.stringify(B.buildPayload(), null, 2);
  const backupBytes = Buffer.byteLength(backupText, 'utf8');
  ok(backupBytes > 50, 'export produces non-trivial JSON (' + backupBytes + ' bytes)');
  ok(JSON.parse(backupText).snapshotVersion === 1, 'export JSON parses, snapshotVersion 1');

  // ---------- IMPORT REPLACE: current rules get wiped+restored -------------------
  B.data.channels = ['@oldchannel'];
  B.data.keywords = ['oldkeyword', 'oldkeyword2'];
  B.data.whitelistChannels = ['@oldwhite'];
  const fakeFile = { text: async () => backupText };
  const okay = await B.doImportFile(fakeFile);
  ok(okay === true, 'doImportFile accepts the exported backup');
  ok(saved.channels.length === 2 && saved.channels[0] === '@science', 'replace: channels are ONLY the backup ones (old gone)');
  ok(!saved.keywords.includes('oldkeyword') && saved.keywords.includes('prank'), 'replace: keywords replaced with backup ones');
  ok(saved.keywords.includes('/^skibidi\\s/i'), 'replace: regex-form keyword kept (case+flags)');
  ok(saved.keywords.length === 4, 'replace: all 4 backup keywords imported');
  ok(saved.whitelistChannels.length === 1 && saved.whitelistChannels[0] === '@veritasium', 'replace: whitelist replaced');
  ok(saved.huntMode === true, 'replace: settings applied (huntMode)');
  ok(JSON.stringify(B.data.channels) === JSON.stringify(saved.channels), 'in-memory data == what was persisted');

  // ---------- IMPORT MERGE: old rules SURVIVE, backup added on top ---------------
  document.getElementById = (id) => id === 'replaceRules' ? { checked: false } : null;
  B.data.channels = ['@oldchannel'];
  B.data.keywords = ['prank'];
  await B.doImportFile(fakeFile);
  ok(saved.channels.includes('@oldchannel') && saved.channels.includes('@science'), 'merge: old + new channels coexist');
  ok(saved.keywords.length === 4 && saved.keywords.includes('prank'), 'merge: union of keywords (deduped)');

  // ---------- CORRUPT / hostile files must never destroy data --------------------
  document.getElementById = (id) => id === 'replaceRules' ? { checked: true } : null;
  const before = JSON.stringify(B.data.channels);
  const bad1 = await B.doImportFile({ text: async () => 'not json at all' });
  ok(bad1 === false && JSON.stringify(B.data.channels) === before, 'corrupt file: import refused, data untouched');
  const bad2 = await B.doImportFile({ text: async () => JSON.stringify({ channels: [42], keywords: [7] }) });
  ok(bad2 === true && saved.channels.every(c => typeof c === 'string'), 'non-string entries coerced to strings, no crash');
  const bad3 = await B.doImportFile({ text: async () => JSON.stringify({ junk: true }) });
  ok(bad3 === false, 'no arrays -> rejected');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();