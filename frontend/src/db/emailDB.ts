import Dexie from "dexie";

export const db = new Dexie("MailDB");

db.version(1).stores({
  emails: "++id, sender, subject, timestamp"
});
