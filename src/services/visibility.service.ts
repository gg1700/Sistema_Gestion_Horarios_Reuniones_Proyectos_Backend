
import {
  processReturnQuery,
  processTransaction
} from "../utils/query";

import {
  visibilityTypes,
  VisibilityChange
} from "../types/visibility.types";

const tables: Record<string, string> = {
  surname: "user_surname",
  email: "user_email",
  phone: "user_phone",
  address: "address",
  country: "user_country",
  workExperience: "workexperience",
  link: "link"
};

const githubSections: Record<string, string> = {
  repositories: "repositories",
  githubActivity: "github_activity"
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class VisibilityError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
  }
}

export async function getVisibility(userId: string) {
  const visibility: VisibilityChange[] = [];

  for (const [type, table] of Object.entries(tables)) {
    const idColumn = type === "surname" ? "user_id" : "id";

    const query = `
      SELECT ${idColumn} AS id, visible
      FROM public.${table}
      WHERE user_id = $1
    `;

    const rows = await processReturnQuery(query, [userId]);

    for (const row of rows) {
      visibility.push({
        type: type as VisibilityChange["type"],
        id: row.id,
        visible: row.visible
      });
    }
  }

  return visibility;
}

export async function updateVisibility(
  userId: string,
  changes: VisibilityChange[]
) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new VisibilityError(
      "Debe enviar una lista de cambios",
      400
    );
  }

  for (const change of changes) {
    if (
      !change ||
      typeof change !== "object" ||
      !visibilityTypes.includes(change.type) ||
      typeof change.visible !== "boolean"
    ) {
      throw new VisibilityError(
        "Tipo de visibilidad o valor visible invalido",
        400
      );
    }

    const isGithub = change.type in githubSections;

    if (isGithub) {
      if (change.id !== undefined) {
        throw new VisibilityError(
          "Las secciones de GitHub no requieren id",
          400
        );
      }
    } else if (change.type === "surname") {
      if (change.id !== undefined && change.id !== userId) {
        throw new VisibilityError(
          "El identificador del apellido no es valido",
          400
        );
      }
    } else if (
      typeof change.id !== "string" ||
      !uuidPattern.test(change.id)
    ) {
      throw new VisibilityError(
        "El registro requiere un id UUID valido",
        400
      );
    }
  }

  await processTransaction(async client => {
    for (const change of changes) {
      const table = tables[change.type];

      const query = change.type === "surname"
        ? `UPDATE public.${table}
           SET visible = $1
           WHERE user_id = $2`
        : `UPDATE public.${table}
           SET visible = $1
           WHERE user_id = $2 AND id = $3`;

      const values = change.type === "surname"
        ? [change.visible, userId]
        : [change.visible, userId, change.id];

      const result = await client.query(query, values);

      if (result.rowCount !== 1) {
        throw new VisibilityError(
          "El registro no existe o no pertenece al usuario",
          404
        );
      }
    }
  });
}
