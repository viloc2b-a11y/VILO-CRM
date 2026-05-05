import type { GrowthChannel, GrowthSegment } from "@/lib/hazlo/growth/types";

export function buildGrowthTrackingUrl(params: {
  offerSlug: string;
  submissionId: string;
  segment: GrowthSegment;
  channel: GrowthChannel;
}): string {
  const base = process.env.HAZLO_GROWTH_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return "";

  const pathTemplate = process.env.HAZLO_GROWTH_OFFER_PATH?.trim() ?? "/offers/{{slug}}";
  const path = pathTemplate.replace("{{slug}}", encodeURIComponent(params.offerSlug));

  const pathPart = path.startsWith("/") ? path : `/${path}`;
  let u: URL;
  try {
    u = new URL(`${base}${pathPart}`);
  } catch {
    return "";
  }

  u.searchParams.set("utm_source", "hazlo_growth");
  u.searchParams.set("utm_medium", params.channel);
  u.searchParams.set("utm_campaign", `${params.segment}_${params.offerSlug}`);
  u.searchParams.set("utm_content", params.submissionId);
  u.searchParams.set("ref_submission", params.submissionId);
  return u.toString();
}
