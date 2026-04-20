const openpgp = require('openpgp');

async function testFingerprint() {
    const { privateKey, publicKey } = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519',
        userIDs: [{ name: 'Test', email: 'test@dmail.com' }],
        passphrase: 'password'
    });

    const originalKey = await openpgp.readKey({ armoredKey: publicKey });
    const originalFingerprint = originalKey.getFingerprint();
    console.log("Original Fingerprint:", originalFingerprint);

    // Simulate truncation
    const truncated = publicKey.substring(0, 500) + "\n-----END PGP PUBLIC KEY BLOCK-----";
    console.log("Truncated Length:", truncated.length);

    // Try to repair from private key
    const privKey = await openpgp.readPrivateKey({ armoredKey: privateKey });
    const repairedKey = privKey.toPublic();
    const repairedFingerprint = repairedKey.getFingerprint();
    console.log("Repaired Fingerprint:", repairedFingerprint);

    console.log("Match?", originalFingerprint === repairedFingerprint);
}

testFingerprint().catch(console.error);
