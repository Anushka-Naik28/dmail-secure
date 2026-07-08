import nodemailer from 'nodemailer';

console.log("⚡ Generating temporary test SMTP credentials...");
nodemailer.createTestAccount(async (err, account) => {
  if (err) {
    console.error("❌ Failed to create test SMTP account:", err);
    return;
  }

  console.log("\n✅ Test SMTP Credentials Generated:");
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  SMTP_HOST   : ${account.smtp.host}`);
  console.log(`  SMTP_PORT   : ${account.smtp.port}`);
  console.log(`  SMTP_SECURE : ${account.smtp.secure}`);
  console.log(`  SMTP_USER   : ${account.user}`);
  console.log(`  SMTP_PASS   : ${account.pass}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass
    }
  });

  const mailOptions = {
    from: `"DMail Gateway" <${account.user}>`,
    to: "legacy-user@gmail.com",
    subject: "DMail Outbound Gateway Relay Test",
    text: "Hello! This email was successfully sent from DMail via the outbound SMTP relay bridge."
  };

  console.log("✉️ Sending test email through relay...");
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully!");
    console.log(`  Message ID  : ${info.messageId}`);
    console.log(`  Preview URL : ${nodemailer.getTestMessageUrl(info)}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  } catch (sendErr) {
    console.error("❌ Failed to send test email:", sendErr);
  }
});
