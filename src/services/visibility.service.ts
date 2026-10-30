import {
  processReturnQuery,
  processTransaction,
} from "../utils/query";
import {
  recordVisibilityTypes,
  visibilityTypes,
} from "../types/visibility.types";
import type {
  GeneralVisibilityType,
  RecordVisibilityType,
  VisibilityChange,
  VisibilitySection,
  VisibilityType,
} from "../types/visibility.types";
import {
  findSectionVisibility,
  upsertSectionVisibility,
} from "../repositories/visibility.repository";

const tables: Record<RecordVisibilityType, string> = {
  surname: "user_surname",
  email: "user_email",
  phone: "user_phone",
  address: "address",
  country: "user_country",
  workExperience: "workexperience",
  link: "link",
  repository: "repository",
  githubActivityList: "github_activity_list",
  githubActivityGrid: "github_activity_grid",
};

const sections: Record<GeneralVisibilityType, VisibilitySection> = {
  repositories: "repositories",
  githubActivity: "github_activity",
};

const userScopedTypes = new Set<RecordVisibilityType>([
  "surname",
  "githubActivityList",
  "githubActivityGrid",
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isGeneralType(
  type: VisibilityType,
): type is GeneralVisibilityType {
  return type === "repositories" || type === "githubActivity";
}

export class VisibilityError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

export async function getVisibility(
  userId: string,
): Promise<VisibilityChange[]> {
  const general = await findSectionVisibility(userId);

  const visibility: VisibilityChange[] = [
    {
      type: "repositories",
      visible: general.repositories,
    },
    {
      type: "githubActivity",
      visible: general.githubActivity,
    },
  ];

  for (const type of recordVisibilityTypes) {
    const table = tables[type];
    const idColumn = userScopedTypes.has(type) ? "user_id" : "id";

    const rows = await processReturnQuery(
      `SELECT ${idColumn} AS id, visible
       FROM public.${table}
       WHERE user_id = $1`,
      [userId],
    );

    for (const row of rows) {
      visibility.push({
        type,
        id: row.id,
        visible: row.visible,
      });
    }
  }

  return visibility;
}

export async function updateVisibility(
  userId: string,
  changes: VisibilityChange[],
): Promise<void> {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new VisibilityError("Debe enviar una lista de cambios", 400);
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
        400,
      );
    }

    if (isGeneralType(change.type) || userScopedTypes.has(change.type)) {
      if (change.id !== undefined && change.id !== userId) {
        throw new VisibilityError(
          `El identificador de ${change.type} no es valido`,
          400,
        );
      }
    } else if (
      typeof change.id !== "string" ||
      !uuidPattern.test(change.id)
    ) {
      throw new VisibilityError(
        "El registro requiere un id UUID valido",
        400,
      );
    }
  }

  await processTransaction(async (client) => {
    for (const change of changes) {
      if (isGeneralType(change.type)) {
        await upsertSectionVisibility(
          client,
          userId,
          sections[change.type],
          change.visible,
        );

        continue;
      }

      const table = tables[change.type];
      const isUserScoped = userScopedTypes.has(change.type);

      if (change.type === "repository" && change.visible) {
        const allowed = await client.query(
          `SELECT r.id
           FROM public.repository r
           WHERE r.user_id = $1
             AND r.id = $2
             AND r.github_visibility = 'public'
             AND EXISTS (
               SELECT 1
               FROM public.external_account a
               WHERE a.user_id = r.user_id
                 AND a.provider = 'github'
                 AND a.state = 'active'
                 AND LOWER(r.url) LIKE
                   'https://github.com/' ||
                   LOWER(a.provider_username) || '/%'
                 AND (
                   a.access_expires_at IS NULL
                   OR a.access_expires_at > NOW()
                 )
             )
           FOR UPDATE OF r`,
          [userId, change.id],
        );

        if (!allowed.rowCount) {
          throw new VisibilityError(
            "El repositorio no está disponible para publicación",
            409,
          );
        }
      }

      const query = isUserScoped
        ? `UPDATE public.${table}
           SET visible = $1
           WHERE user_id = $2`
        : `UPDATE public.${table}
           SET visible = $1
           WHERE user_id = $2 AND id = $3`;

      const values = isUserScoped
        ? [change.visible, userId]
        : [change.visible, userId, change.id];

      const result = await client.query(query, values);

      if (result.rowCount !== 1) {
        throw new VisibilityError(
          "El registro no existe o no pertenece al usuario",
          404,
        );
      }
    }
  });
}