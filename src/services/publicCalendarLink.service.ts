import { env } from "../config/env.config";
import { NotFoundError } from "../helpers/errors.helper";
import {
  findActiveUserHandle,
  findPublicCalendarLink,
  upsertPublicCalendarLink,
} from "../repositories/publicCalendarLink.repository";
import type { PublicCalendarLinkResponse } from "../types/publicCalendarLink.types";
import { processTransaction } from "../utils/query";

function buildPublicCalendarLink(
  handleName: string,
  active: boolean,
): PublicCalendarLinkResponse {
  const handle = encodeURIComponent(handleName);
  const base = env.PUBLIC_CALENDAR_BASE_URL;
  if (!base) {
    throw new Error("Falta configurar PUBLIC_CALENDAR_BASE_URL");
  }
  const baseUrl = new URL(base);
  baseUrl.pathname = `/${handle}/disponibilidad`;
  baseUrl.search = "";
  baseUrl.hash = "";

  return {
    handleName,
    active,
    url: baseUrl.toString(),
    publicApiPath: `/api/v1/public/calendars/${handle}`,
  };
}

export async function getPublicCalendarLink(
  userId: string,
): Promise<PublicCalendarLinkResponse> {
  const link = await findPublicCalendarLink(userId);
  if (link === null) {
    throw new NotFoundError("Usuario no disponible");
  }

  return buildPublicCalendarLink(link.handleName, link.active);
}

export async function updatePublicCalendarLink(
  userId: string,
  active: boolean,
): Promise<PublicCalendarLinkResponse> {
  return processTransaction(async (client) => {
    const handleName = await findActiveUserHandle(client, userId);
    if (handleName === null) {
      throw new NotFoundError("Usuario no disponible");
    }

    const link = buildPublicCalendarLink(handleName, active);
    await upsertPublicCalendarLink(client, userId, active);
    return link;
  });
}
