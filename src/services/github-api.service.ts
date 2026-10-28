import { Octokit } from "octokit";
import * as ArrayConstants from "../utils/constants/array.constants";
import * as GitHubTypes from "../types/github.types";

export async function getGithubActivity(octokit: Octokit, username: string) {
  try {
    const { data } = await octokit.request(`GET /users/{username}/events`, {
      username: username,
      per_page: 100,
      headers: { "X-GitHub-Api-Version": "2026-03-10" }
    });

    const filteredEvents = data.filter((e) => e.type !== null && ArrayConstants.GITHUB_EVENT_TYPES.includes(e.type));
    return { 
      result: true,
      statusCode: 200,
      message: "Actividad reciente de GitHub del usuario obtenida correctamente",
      data: filteredEvents
    };
  } catch (err) {
    return {
      result: false,
      statusCode: (err as any).status ?? 500,
      message: `Error en el servicio: ${(err as Error).message}`
    };
  }
}

export async function getGithubActivityGrid(octokit: Octokit, username: string) {
  try {
    const query = `
      query($username: String!) {
        user(login: $username) {
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                  color
                }
              }
            }
          }
        }
      } 
    `;
    const data = await octokit.graphql(query, { username: username }) as GitHubTypes.GridResponse;
    const activityGrid = data.user.contributionsCollection.contributionCalendar;
    return {
      result: true,
      statusCode: 200,
      message: "Grilla de actividad de GitHub obtenida correctamente",
      data: activityGrid
    }
  } catch (err) {
    return {
      result: false,
      statusCode: (err as any).status ?? 500,
      message: `Error en el servicio: ${(err as Error).message}`
    };
  }
}