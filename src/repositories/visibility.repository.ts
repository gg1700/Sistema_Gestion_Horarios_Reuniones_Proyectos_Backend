import type { PoolClient } from "pg";
import { processReturnQuery } from "../utils/query";
import type {
  SectionVisibility,
  VisibilitySection,
} from "../types/visibility.types";

export async function findSectionVisibility(
  userId: string,
): Promise<SectionVisibility> {
  const rows = await processReturnQuery(
    `SELECT section, visible
     FROM public.field_visibility
     WHERE user_id = $1
       AND section IN ('repositories', 'github_activity')`,
    [userId],
  );

  const visibility: SectionVisibility = {
    repositories: false,
    githubActivity: false,
  };

  for (const row of rows) {
    if (row.section === "repositories") {
      visibility.repositories = row.visible === true;
    }

    if (row.section === "github_activity") {
      visibility.githubActivity = row.visible === true;
    }
  }

  return visibility;
}

export async function upsertSectionVisibility(
  client: PoolClient,
  userId: string,
  section: VisibilitySection,
  visible: boolean,
): Promise<void> {
  await client.query(
    `INSERT INTO public.field_visibility (user_id, section, visible)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, section)
     DO UPDATE SET visible = EXCLUDED.visible`,
    [userId, section, visible],
  );
}