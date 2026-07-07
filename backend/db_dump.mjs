import Gun from 'gun';
const gun = Gun({ peers: ['http://127.0.0.1:8765/gun'] });

console.log("Querying users...");

gun.get('securemail_users').map().once((data, key) => {
  if (data) {
    console.log(`👤 User: ${key} -> name: ${data.name}, email: ${data.email}`);
  }
});

setTimeout(() => {
  console.log("Querying emails...");
  gun.get('securemail_users').map().once((data, key) => {
    if (data && data.email) {
      const email = data.email.trim().toLowerCase();
      gun.get(`user_mail_index:${email}`).map().once((mail, mailKey) => {
        if (mail) {
          console.log(`✉️ Mail in index:${email} -> id: ${mail.id}, sender: ${mail.senderEmail}, receiver: ${mail.receiverEmail}, status: ${mail.status}, subject: ${mail.subject}`);
        }
      });
    }
  });
}, 3000);

setTimeout(() => {
  console.log("Finished query. Exiting.");
  process.exit(0);
}, 6000);
