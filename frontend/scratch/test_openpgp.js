const openpgp = require('openpgp');

async function test() {
    try {
        console.log("Testing with type: 'curve25519'");
        const result = await openpgp.generateKey({
            type: 'curve25519',
            userIDs: [{ name: 'test', email: 'test@test.com' }],
            passphrase: 'test'
        });
        console.log("Result:", result);
    } catch (err) {
        console.log("Caught Error (type: 'curve25519'):", err);
        console.log("Error type:", typeof err);
        console.log("Error keys:", Object.keys(err || {}));
    }

    try {
        console.log("\nTesting with type: 'ecc', curve: 'curve25519'");
        const result = await openpgp.generateKey({
            type: 'ecc',
            curve: 'curve25519',
            userIDs: [{ name: 'test', email: 'test@test.com' }],
            passphrase: 'test'
        });
        console.log("Success! Keys generated.");
    } catch (err) {
        console.log("Caught Error (type: 'ecc'):", err);
    }
}

test();
