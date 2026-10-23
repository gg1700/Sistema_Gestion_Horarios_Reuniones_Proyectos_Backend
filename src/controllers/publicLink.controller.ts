import type { Request, Response } from "express";
import { PublicLinkError, PublicLinkService } from "../services/publicLink.service";
import type { PublicLinkUserId } from "../types/publicLink";

type AuthenticatedUserResolver = (req: Request) => PublicLinkUserId | null;

export function createPublicLinkController(
  service: PublicLinkService,
  resolveUserId: AuthenticatedUserResolver
) {
  function isValidUserId(userId: PublicLinkUserId | null): userId is PublicLinkUserId {
    if (typeof userId === "string") {
      return userId.trim().length > 0;
    }

    return typeof userId === "number" && Number.isSafeInteger(userId) && userId > 0;
  }

  function handleError(res: Response, error: unknown): void {
    if (error instanceof PublicLinkError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        errorCode: error.errorCode,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Error interno del servidor.",
    });
  }

  async function execute(
    req: Request,
    res: Response,
    operation: (userId: PublicLinkUserId) => Promise<unknown>
  ): Promise<void> {
    try {
      const userId = resolveUserId(req);

      if (!isValidUserId(userId)) {
        res.status(401).json({
          success: false,
          message: "Debes iniciar sesión para continuar.",
        });
        return;
      }

      const data = await operation(userId);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  return {
    get(req: Request, res: Response): Promise<void> {
      return execute(req, res, (userId) => service.get(userId));
    },

    checkAvailability(req: Request, res: Response): Promise<void> {
      return execute(req, res, (userId) => service.checkAvailability(req.query.handle, userId));
    },

    update(req: Request, res: Response): Promise<void> {
      return execute(req, res, (userId) => service.update(userId, req.body));
    },
  };
}
