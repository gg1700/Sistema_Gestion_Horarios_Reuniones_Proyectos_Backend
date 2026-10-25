
import { processReturnQuery, processTransaction } from "../utils/query";
import { visibilityTypes, VisibilityChange, VisibilityType } from "../types/visibility.types";

const tables: Record<VisibilityType, string> = {
  surname: "user_surname",
  email: "user_email",
  phone: "user_phone",
  address: "address",
  country: "user_country",
  workExperience: "workexperience",
  link: "link",
  repository: "repository",
  githubActivityList: "github_activity_list",
  githubActivityGrid: "github_activity_grid"
};

const userScopedTypes = new Set([
  "surname",
  "githubActivityGrid",
  "githubActivityList"
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class VisibilityError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

export async function getVisibility(userId: string) {
  const visibility: VisibilityChange[] = [];

  for (const [type, table] of Object.entries(tables)) {
    const idColumn = (userScopedTypes.has(type)) ? "user_id" : "id";

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

export async function updateVisibility(userId: string, changes: VisibilityChange[]) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new VisibilityError("Debe enviar una lista de cambios", 400);
  }

  for (const change of changes) {
    if (!change || typeof change !== "object" || !visibilityTypes.includes(change.type) ||
      typeof change.visible !== "boolean") {
      throw new VisibilityError("Tipo de visibilidad o valor visible invalido", 400);
    }

    if (userScopedTypes.has(change.type)) {
      if (change.id !== undefined && change.id !== userId) {
        throw new VisibilityError( `El identificador de ${change.type} no es valido`, 400);
      }
    } else if (typeof change.id !== "string" || !uuidPattern.test(change.id)) {
      throw new VisibilityError("El registro requiere un id UUID valido", 400);
    }
  }

  await processTransaction(async client => {
    for (const change of changes) {
      const table = tables[change.type];

      const isUserScoped = userScopedTypes.has(change.type);
      const query = isUserScoped
        ? `UPDATE public.${table} SET visible = $1 WHERE user_id = $2`
        : `UPDATE public.${table} SET visible = $1 WHERE user_id = $2 AND id = $3`;
      const values = isUserScoped ? [change.visible, userId] : [change.visible, userId, change.id];

      const result = await client.query(query, values);

      if (result.rowCount !== 1) {
        throw new VisibilityError("El registro no existe o no pertenece al usuario", 404);
      }
    }
  });
}