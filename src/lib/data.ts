import groupsJson from "../data/groups.json";
import manifestJson from "../data/migration_manifest.json";
import paperJson from "../data/paper_templates.json";
import presetsJson from "../data/presets.json";
import stampsJson from "../data/stamps.json";
import userStampsJson from "../data/user_stamps.json";
import type { MigrationManifest, PaperTemplate, Preset, Stamp, ToolGroup, UserStamp } from "./types";

export const groups = groupsJson.groups as unknown as ToolGroup[];
export const presets = presetsJson.presets as unknown as Preset[];
export const stamps = (stampsJson.stamps as unknown as Stamp[]).filter(
  (stamp): stamp is Stamp => stamp.imageUrl !== null,
);
export const paperTemplates = paperJson.templates as unknown as PaperTemplate[];
export const pdfTemplates = paperJson.pdfTemplates as { name: string; bytes: number; sha256: string; url: string }[];
export const userStamps = (userStampsJson.stamps as unknown as UserStamp[]) ?? [];
export const manifest = manifestJson as unknown as MigrationManifest;

export const groupById = new Map(groups.map((group) => [group.id, group]));
export const presetById = new Map(presets.map((preset) => [preset.id, preset]));
export const paperById = new Map(paperTemplates.map((template) => [template.id, template]));
export const stampById = new Map(stamps.map((stamp) => [stamp.id, stamp]));

export const presetCounts = {
  groups: groups.length,
  presets: presets.length,
  stamps: stamps.length,
  paper: paperTemplates.length,
  userStamps: userStamps.length,
};

/** First page style used before the user has opened anything. */
export const DEFAULT_TEMPLATE_ID = paperTemplates.find((t) => t.id === "paper-000")?.id ?? paperTemplates[0].id;

export function stampsOfGroup(groupSlug: string): Stamp[] {
  return stamps.filter((stamp) => stamp.groupSlug === groupSlug);
}

export function userStampsOfGroup(groupName: string): UserStamp[] {
  return userStamps.filter((stamp) => stamp.groupName === groupName);
}

/** Stamp groups in factory order, joined with their localized captions. */
export function stampGroups() {
  const seen: { slug: string; name: string; de: string; count: number }[] = [];
  for (const group of groups) {
    const own = stampsOfGroup(group.slug);
    if (own.length > 0) {
      seen.push({
        slug: group.slug,
        name: group.captions.en,
        de: group.captions.de,
        count: own.length,
      });
    }
  }
  return seen;
}

export function userStampGroups() {
  const counts = new Map<string, number>();
  for (const stamp of userStamps) {
    counts.set(stamp.groupName, (counts.get(stamp.groupName) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
