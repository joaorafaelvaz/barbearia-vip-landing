import { prisma } from "@/lib/db";

export type InfluencerPublic = { slug: string; name: string; handle: string | null };

export async function getActiveInfluencerBySlug(slug: string | null | undefined): Promise<InfluencerPublic | null> {
  if (!slug) return null;
  return prisma.influencer.findFirst({
    where: { slug, active: true },
    select: { slug: true, name: true, handle: true },
  });
}
