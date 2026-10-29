import { processReturnQuery } from "../utils/query";

export async function upsertGithubActivity(userId: string, activityType: "list" | "grid", activity: string) {
  const table = (activityType === "list") ? "github_activity_list" : "github_activity_grid";
  const query = `INSERT INTO "${table}" (user_id, activity, fetched_at)
    VALUES ($1, $2, now())
    ON CONFLICT (user_id)
    DO UPDATE SET
      activity = EXCLUDED.activity,
      fetched_at = EXCLUDED.fetched_at`;
  const values = [userId, activity];
  await processReturnQuery(query, values);
}

export async function getGithubActivity(userId: string, activityType: "list" | "grid") {
  const table = (activityType === "list") ? "github_activity_list" : "github_activity_grid";
  const query = `SELECT activity, fetched_at FROM "${table}"
    WHERE user_id = $1`;
  const values = [userId];
  const githubActivities = await processReturnQuery(query, values);
  return githubActivities;
}