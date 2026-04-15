import('openpgp').then(m => {
  console.log('Keys in openpgp module:', Object.keys(m));
  console.log('Is generateKey a function?', typeof m.generateKey);
  if (m.default) {
    console.log('Keys in openpgp.default:', Object.keys(m.default));
    console.log('Is generateKey in default a function?', typeof m.default.generateKey);
  }
}).catch(err => {
  console.error('Import failed:', err);
});
