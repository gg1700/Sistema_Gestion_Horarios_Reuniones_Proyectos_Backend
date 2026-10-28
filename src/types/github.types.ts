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