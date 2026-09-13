import { getPrismaClient } from "@/lib/database/prisma";
const db = getPrismaClient();
const p = await db.placement.findFirst({
  where: { status: "AWAITING_INSTALL" },
  select: { id: true, status: true,
    campaign: { select: { name: true, status: true, fundedAt: true } },
    jobs: { select: { role: true, status: true } } },
});
console.log("AWAITING_INSTALL placement:", JSON.stringify(p, null, 1));
