import { getPrismaClient } from "@/lib/database/prisma";
const db = getPrismaClient();
const placements = await db.placement.findMany({
  select: { id: true, status: true, installerUserId: true, verifierUserId: true,
    campaign: { select: { name: true, status: true } },
    jobs: { select: { role: true, status: true, workerUserId: true } } },
  take: 20,
});
console.log("placements:", placements.length);
for (const p of placements) {
  console.log(` ${p.id.slice(0,8)} ${p.status} campaign=${p.campaign.status} installer=${p.installerUserId?.slice(0,8)??"-"} jobs=[${p.jobs.map(j=>`${j.role}:${j.status}`).join(", ")}]`);
}
console.log("\ncampaigns by status:");
const c = await db.campaign.groupBy({ by: ["status"], _count: true });
console.log(c.map(x=>`${x.status}=${x._count}`).join(" "));
