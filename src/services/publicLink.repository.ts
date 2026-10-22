import type { QueryResultRow } from "pg";
import pool from "../config/database.config";
import type {
  PublicLinkAccount,
  PublicLinkChanges,
  PublicLinkRepository,
  PublicLinkUserId,
} from "../types/publicLink";

interface PublicLinkRow extends QueryResultRow {
  id: string | number;
  handle_name: string;
  public_link_active: boolean;
}

function mapPublicLink(row: PublicLinkRow): PublicLinkAccount {
  return {
    userId: row.id,
    handleName: row.handle_name,
    publicLinkActive: row.public_link_active,
  };
}

export const publicLinkRepository: PublicLinkRepository = {
  async findByUserId(userId: PublicLinkUserId) {
    const result = await pool.query<PublicLinkRow>(
      `SELECT id, handle_name, public_link_active
       FROM public.users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    const row = result.rows[0];
    return row ? mapPublicLink(row) : null;
  },

  async findByHandle(handleName: string) {
    const result = await pool.query<PublicLinkRow>(
      `SELECT id, handle_name, public_link_active
       FROM public.users
       WHERE LOWER(handle_name) = LOWER($1)
       LIMIT 1`,
      [handleName]
    );

    const row = result.rows[0];
    return row ? mapPublicLink(row) : null;
  },

  async updateByUserId(userId: PublicLinkUserId, changes: PublicLinkChanges) {
    const assignments: string[] = [];
    const values: (string | number | boolean)[] = [];

    if (changes.handleName !== undefined) {
      values.push(changes.handleName);
      assignments.push(`handle_name = $${values.length}`);
    }

    if (changes.publicLinkActive !== undefined) {
      values.push(changes.publicLinkActive);
      assignments.push(`public_link_active = $${values.length}`);
    }

    if (assignments.length === 0) {
      return this.findByUserId(userId);
    }

    values.push(userId);

    const result = await pool.query<PublicLinkRow>(
      `UPDATE public.users
       SET ${assignments.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, handle_name, public_link_active`,
      values
    );

    const row = result.rows[0];
    return row ? mapPublicLink(row) : null;
  },
};
