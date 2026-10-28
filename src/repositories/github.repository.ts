import { processReturnQuery } from "../utils/query";

export async function upsertGithubActivity(userId: string, activityType: "activity" | "grid", activity: string) {
  const table = (activityType === "activity") ? "github_activity_list" : "github_activity_grid";
  const query = `INSERT INTO "${table}" (user_id, activity, fetched_at)
    VALUES ($1, $2, now())
    ON CONFLICT (user_id)
    DO UPDATE SET
      activity = EXCLUDED.activity,
      fetched_at = EXCLUDED.fetched_at`;
  const values = [userId, activity];
  await processReturnQuery(query, values);
}