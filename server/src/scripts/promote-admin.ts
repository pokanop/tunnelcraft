/* Out-of-band admin seeding.

   Promotes a single user to admin, driven by the ADMIN_SEED_EMAIL env var so no
   person's email is baked into version control (the Stage 1 design's §5
   tradeoff: hardcoding an email inside a migration `post` hook would replay on
   every fresh dev/test DB and entrench the address in schema history forever).

   Run with:
     ADMIN_SEED_EMAIL=sahel@pokanop.com bun server/src/scripts/promote-admin.ts

   Preconditions:
   - The target account must already exist (register it first if not — the
     UPDATE below is a no-op on an unknown email and the script exits non-zero).
   - The v4 `role` column must be present; importing db.ts runs migrate(), so a
     fresh DB is replayed up through v4 before the UPDATE runs.

   Fallback: an operator with direct DB access can run the raw SQL instead —
     UPDATE users SET role = 'admin' WHERE email = 'sahel@pokanop.com';
     SELECT COUNT(*) AS admins FROM users WHERE role = 'admin';
 */
import { db, q } from "../db";

const email = (process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase();
if (!email) {
  console.error("Set ADMIN_SEED_EMAIL to the account you want to promote");
  process.exit(1);
}

const before = q.userByEmail.get(email);
if (!before) {
  console.error(`No user found for ${email} — register the account first, then re-run`);
  db.close();
  process.exit(1);
}

if (before.role === "admin") {
  console.log(`${email} is already an admin (no change)`);
  db.close();
  process.exit(0);
}

q.setUserRole.run("admin", before.id);
const after = q.userByEmail.get(email);
console.log(`promoted ${email}: role ${before.role} -> ${after?.role ?? "?"}`);
db.close();
