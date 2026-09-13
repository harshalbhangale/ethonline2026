import { getPrismaClient } from "@/lib/database/prisma";
const db = getPrismaClient();
const rows = await db.placement.groupBy({ by: ["verificationMode"], _count: true });
console.log("placements by verificationMode:", rows.map(r=>`${r.verificationMode}=${r._count}`).join("  "));
const mine = await db.placement.findMany({
  where: { status: { in: ["READY_FOR_FINAL_VERIFICATION","INSTALL_SUBMITTED","AWAITING_VERIFIER"] } },
  select: { id: true, status: true, verificationMode: true,
    jobs: { select: { role: true, status: true } } },
});
for (const p of mine) console.log(` ${p.id.slice(0,10)} ${p.status} mode=${p.verificationMode} jobs=[${p.jobs.map(j=>j.role+":"+j.status).join(", ")}]`);
