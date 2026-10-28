export interface GridResponse {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: {
          contributionDays: {
            date: string;
            contributionCount: number;
            color: string;
          }[]
        }[];
      }
    }
  }
}

export interface EventActivity {
  type: string | null;
  repo: Repository;
  date: Date | string | null;
  payload: any;
}

interface Repository {
  id: number;
  name: string;
  url: string;
}