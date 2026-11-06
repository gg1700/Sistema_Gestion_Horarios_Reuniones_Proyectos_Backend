export interface AvailabilityRuleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

export interface ReplaceAvailabilityRulesInput {
  timeZone: string;
  rules: AvailabilityRuleInput[];
}

export interface AvailabilityRuleResponse extends AvailabilityRuleInput {
  id: string;
}

export interface AvailabilityRulesResponse {
  timeZone: string;
  rules: AvailabilityRuleResponse[];
}