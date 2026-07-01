import net from 'net';
import Gun from 'gun';
import * as openpgp from 'openpgp'; 
import CryptoJS from 'crypto-js';

// ── Configuration ──
const POP3_PORT = 1110;
const GUN_PORT = 8765;

const gun = Gun({
  peers: [`http://localhost:${GUN_PORT}/gun`],
  file: "data_pop3"
});

// ── Helper: Fetch and Decrypt ──
const fetchUserMails = async (email, password) => {
    return new Promise((resolve) => {
        const cleanEmail = email.trim().toLowerCase();
        const results = [];
        let count = 0;

        // 1. Authenticate & Get Private Key
        gun.get("securemail_users").get(cleanEmail).once(async (user) => {
            if (!user || user.password !== password) {
                return resolve(null);
            }

            const encryptedPrivKey = user.privateKey;
            let privKeyArmored = encryptedPrivKey;

            // 🛡️ [Vault Decryption]
            // If the key is encrypted with CryptoJS (Vault Strategy), decrypt it first.
            try {
                if (encryptedPrivKey && !encryptedPrivKey.includes("-----BEGIN PGP PRIVATE KEY BLOCK-----")) {
                    const bytes = CryptoJS.AES.decrypt(encryptedPrivKey, password);
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    if (decrypted.includes("-----BEGIN PGP PRIVATE KEY BLOCK-----")) {
                        privKeyArmored = decrypted;
                        console.log(`🔑 [POP3] Vault decrypted for ${cleanEmail}`);
                    }
                }
            } catch (e) {
                console.warn(`⚠️ [POP3] Vault decryption failed for ${cleanEmail}:`, e.message);
            }
            
            // 2. Fetch Mails from Index
            gun.get(`user_mail_index:${cleanEmail}`).map().once(async (mail) => {
                if (!mail || !mail.id) return;
                
                try {
                    // 3. Decrypt Body if it's PGP-encrypted
                    let decryptedBody = mail.message;
                    if (mail.message && mail.message.includes('-----BEGIN PGP MESSAGE-----')) {
                        try {
                            const message = await openpgp.readMessage({ armoredMessage: mail.message });
                            const privateKey = await openpgp.readPrivateKey({ armoredKey: privKeyArmored });
                            // Note: We're assuming the private key is not further passphrase protected 
                            // or that the password provided is the same as the PGP passphrase.
                            const { data: decrypted } = await openpgp.decrypt({
                                message,
                                decryptionKeys: privateKey,
                            });
                            decryptedBody = decrypted;
                        } catch (err) {
                            decryptedBody = `[Decryption Failed: ${err.message}]`;
                        }
                    }

                    results.push({
                        id: mail.id,
                        from: mail.senderEmail || 'unknown@dmail.com',
                        to: cleanEmail,
                        subject: mail.subject || '(No Subject)',
                        date: new Date(mail.timestamp || Date.now()).toUTCString(),
                        body: decryptedBody
                    });
                } catch (e) {
                    console.error('❌ Error processing mail:', e);
                }
            });

            // Give GunDB 2 seconds to collect results from the mesh
            setTimeout(() => resolve(results), 2000);
        });
    });
};

const formatAsMime = (mail) => {
    return [
        `From: ${mail.from}`,
        `To: ${mail.to}`,
        `Subject: ${mail.subject}`,
        `Date: ${mail.date}`,
        `Message-ID: <${mail.id}@dmail.local>`,
        `Content-Type: text/plain; charset=utf-8`,
        '',
        mail.body,
        ''
    ].join('\r\n');
};

const server = net.createServer((socket) => {
    let state = 'AUTHORIZATION';
    let userEmail = null;
    let userPass = null;
    let mailboxes = [];

    const send = (msg) => socket.write(`${msg}\r\n`);
    const ok = (msg = '') => send(`+OK ${msg}`);
    const err = (msg = '') => send(`-ERR ${msg}`);

    console.log('📬 [POP3] New connection');
    ok('DMail POP3 Bridge (Decryption Active)');

    socket.on('data', async (buffer) => {
        const line = buffer.toString().trim();
        const [cmd, ...args] = line.split(' ');
        const upperCmd = cmd.toUpperCase();

        try {
            switch (upperCmd) {
                case 'CAPA':
                    ok('Capability list follows');
                    send('USER');
                    send('RESP-CODES');
                    send('UIDL');
                    send('.');
                    break;

                case 'USER':
                    userEmail = args[0];
                    ok(`User ${userEmail} accepted.`);
                    break;

                case 'PASS':
                    userPass = args[0];
                    const mails = await fetchUserMails(userEmail, userPass);
                    if (mails) {
                        mailboxes = mails;
                        state = 'TRANSACTION';
                        ok(`Logged in! You have ${mailboxes.length} messages.`);
                    } else {
                        err('Authentication failed.');
                    }
                    break;

                case 'STAT':
                    if (state !== 'TRANSACTION') return err('Must authenticate');
                    const totalSize = mailboxes.reduce((acc, m) => acc + JSON.stringify(m).length, 0);
                    ok(`${mailboxes.length} ${totalSize}`);
                    break;

                case 'LIST':
                    if (state !== 'TRANSACTION') return err('Must authenticate');
                    ok(`${mailboxes.length} messages`);
                    mailboxes.forEach((m, i) => {
                        send(`${i + 1} ${JSON.stringify(m).length}`);
                    });
                    send('.');
                    break;

                case 'UIDL':
                    if (state !== 'TRANSACTION') return err('Must authenticate');
                    ok();
                    mailboxes.forEach((m, i) => {
                        send(`${i + 1} ${m.id}`);
                    });
                    send('.');
                    break;

                case 'RETR':
                    if (state !== 'TRANSACTION') return err('Must authenticate');
                    const idx = parseInt(args[0]) - 1;
                    if (mailboxes[idx]) {
                        const mime = formatAsMime(mailboxes[idx]);
                        ok(`${mime.length} octets`);
                        send(mime);
                        send('.');
                    } else {
                        err('No such message');
                    }
                    break;

                case 'QUIT':
                    ok('Goodbye');
                    socket.end();
                    break;

                default:
                    err('Unknown command');
            }
        } catch (e) {
            console.error('❌ POP3 Server error:', e);
            err('Internal error');
        }
    });
});

server.listen(POP3_PORT, '0.0.0.0', () => {
    console.log(`\n🚀 DMail POP3 Decryption Bridge`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Port: ${POP3_PORT}`);
    console.log(`✅ Authentication: Same as DMail Web`);
    console.log(`✅ Security: Local Decryption Only`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
