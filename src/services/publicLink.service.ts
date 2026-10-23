import { validatePublicHandle } from "../helpers/publicLink.helper";
import type {
  HandleAvailabilityResult,
  PublicLinkAccount,
  PublicLinkChanges,
  PublicLinkDetails,
  PublicLinkRepository,
  PublicLinkUserId,
} from "../types/publicLink";

export class PublicLinkError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode: string
  ) {
    super(message);
    this.name = "PublicLinkError";
  }
}

export class PublicLinkService {
  constructor(
    private readonly repository: PublicLinkRepository,
    private readonly frontendBaseUrl: string
  ) {}

  async get(userId: PublicLinkUserId): Promise<PublicLinkDetails> {
    const account = await this.findAccount(userId);
    return this.toDetails(account);
  }

  async checkAvailability(
    handle: unknown,
    userId: PublicLinkUserId
  ): Promise<HandleAvailabilityResult> {
    const validation = validatePublicHandle(handle);

    if (!validation.valid) {
      throw new PublicLinkError(validation.error, 400, "INVALID_HANDLE");
    }

    const existing = await this.repository.findByHandle(validation.handleName);

    return {
      handleName: validation.handleName,
      available: existing === null || existing.userId === userId,
    };
  }

  async update(userId: PublicLinkUserId, input: unknown): Promise<PublicLinkDetails> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new PublicLinkError("Datos de actualización inválidos.", 400, "INVALID_BODY");
    }

    const body = input as Record<string, unknown>;
    const fields = Object.keys(body);

    if (
      fields.length === 0 ||
      fields.some((field) => field !== "handleName" && field !== "publicLinkActive")
    ) {
      throw new PublicLinkError("Campos de actualización inválidos.", 400, "INVALID_BODY");
    }

    const current = await this.findAccount(userId);
    const changes: PublicLinkChanges = {};

    if (Object.prototype.hasOwnProperty.call(body, "handleName")) {
      const validation = validatePublicHandle(body.handleName);

      if (!validation.valid) {
        throw new PublicLinkError(validation.error, 400, "INVALID_HANDLE");
      }

      if (validation.handleName !== current.handleName) {
        const existing = await this.repository.findByHandle(validation.handleName);

        if (existing && existing.userId !== userId) {
          throw new PublicLinkError("El identificador ya está ocupado.", 409, "HANDLE_TAKEN");
        }

        changes.handleName = validation.handleName;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "publicLinkActive")) {
      if (typeof body.publicLinkActive !== "boolean") {
        throw new PublicLinkError("El estado del enlace debe ser booleano.", 400, "INVALID_STATUS");
      }

      changes.publicLinkActive = body.publicLinkActive;
    }

    if (Object.keys(changes).length === 0) {
      return this.toDetails(current);
    }

    try {
      const updated = await this.repository.updateByUserId(userId, changes);

      if (!updated) {
        throw new PublicLinkError("Usuario no encontrado.", 404, "NOT_FOUND");
      }

      return this.toDetails(updated);
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new PublicLinkError("El identificador ya está ocupado.", 409, "HANDLE_TAKEN");
      }

      throw error;
    }
  }

  private async findAccount(userId: PublicLinkUserId): Promise<PublicLinkAccount> {
    const account = await this.repository.findByUserId(userId);

    if (!account) {
      throw new PublicLinkError("Usuario no encontrado.", 404, "NOT_FOUND");
    }

    return account;
  }

  private toDetails(account: PublicLinkAccount): PublicLinkDetails {
    const baseUrl = this.frontendBaseUrl.replace(/\/+$/, "");

    return {
      handleName: account.handleName,
      url: `${baseUrl}/@${encodeURIComponent(account.handleName)}`,
      publicLinkActive: account.publicLinkActive,
    };
  }
}
