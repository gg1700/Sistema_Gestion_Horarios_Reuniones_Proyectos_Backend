import { AuthenticationError } from "../helpers/errors.helper";
import * as repository from "../repositories/availabilityRules.repository";
import type {
  AvailabilityRulesResponse,
  ReplaceAvailabilityRulesInput,
} from "../types/availabilityRules.types";
import { processTransaction } from "../utils/query";

export async function getAvailabilityRules(
  userId: string,
): Promise<AvailabilityRulesResponse> {
  const configuredTimeZone = await repository.findCalendarSettings(userId);

  if (configuredTimeZone === null) {
    const timeZone =
      (await repository.findGoogleCalendarTimeZone(userId)) ?? "UTC";

    return { timeZone, rules: [] };
  }

  const rules = await repository.findAvailabilityRules(userId);

  return { timeZone: configuredTimeZone, rules };
}

export async function replaceAvailabilityRules(
  userId: string,
  input: ReplaceAvailabilityRulesInput,
): Promise<AvailabilityRulesResponse> {
  return processTransaction(async (client) => {
    const ownerExists = await repository.lockAvailabilityOwner(client, userId);

    if (!ownerExists) {
      throw new AuthenticationError("Sesion invalida o usuario no disponible");
    }

    await repository.upsertCalendarSettings(
      client,
      userId,
      input.timeZone,
    );

    const rules = await repository.replaceAvailabilityRules(
      client,
      userId,
      input.rules,
    );

    return { timeZone: input.timeZone, rules };
  });
}