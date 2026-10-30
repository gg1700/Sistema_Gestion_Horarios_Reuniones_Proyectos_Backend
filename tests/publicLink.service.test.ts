import { describe, expect, it } from "vitest";
import { PublicLinkService } from "../src/services/publicLink.service";
import type {
  PublicLinkAccount,
  PublicLinkRepository
} from "../src/types/publicLink";

function createTestService() {
  const accounts: PublicLinkAccount[] = [
    {
      userId: "user-1",
      handleName: "fabio-dev",
      publicLinkActive: true
    },
    {
      userId: "user-2",
      handleName: "ocupado",
      publicLinkActive: true
    }
  ];

  const repository: PublicLinkRepository = {
    async findByUserId(userId) {
      return accounts.find(account => account.userId === userId) ?? null;
    },

    async findByHandle(handleName) {
      return accounts.find(
        account => account.handleName.toLowerCase() === handleName.toLowerCase()
      ) ?? null;
    },

    async updateByUserId(userId, changes) {
      const account = accounts.find(account => account.userId === userId);

      if (!account) return null;

      if (changes.handleName !== undefined) {
        account.handleName = changes.handleName;
      }

      if (changes.publicLinkActive !== undefined) {
        account.publicLinkActive = changes.publicLinkActive;
      }

      return { ...account };
    }
  };

  return {
    service: new PublicLinkService(repository, "http://localhost:5173/"),
    repository
  };
}

describe("T-49 - Gestion del enlace publico", () => {
  it("consulta el identificador, URL y estado", async () => {
    const { service } = createTestService();

    const result = await service.get("user-1");

    expect(result).toEqual({
      handleName: "fabio-dev",
      url: "http://localhost:5173/fabio-dev",
      publicLinkActive: true
    });
  });

  it("identifica handles disponibles y ocupados", async () => {
    const { service } = createTestService();

    expect(await service.checkAvailability("nuevo-handle", "user-1"))
      .toMatchObject({ available: true });

    expect(await service.checkAvailability("ocupado", "user-1"))
      .toMatchObject({ available: false });

    expect(await service.checkAvailability("fabio-dev", "user-1"))
      .toMatchObject({ available: true });
  });

  it("rechaza nombres reservados", async () => {
    const { service } = createTestService();

    for (const handle of ["admin", "api", "login", "public"]) {
      await expect(service.checkAvailability(handle, "user-1"))
        .rejects.toMatchObject({
          statusCode: 400,
          errorCode: "INVALID_HANDLE"
        });
    }
  });

  it("rechaza identificadores con formato invalido", async () => {
    const { service } = createTestService();

    for (const handle of ["ab", "Nombre", "mi_usuario", "a".repeat(51)]) {
      await expect(service.update("user-1", { handleName: handle }))
        .rejects.toMatchObject({
          statusCode: 400,
          errorCode: "INVALID_HANDLE"
        });
    }
  });

  it("rechaza un identificador que pertenece a otro usuario", async () => {
    const { service } = createTestService();

    await expect(service.update("user-1", { handleName: "ocupado" }))
      .rejects.toMatchObject({
        statusCode: 409,
        errorCode: "HANDLE_TAKEN"
      });

    expect((await service.get("user-1")).handleName).toBe("fabio-dev");
  });

  it("cambia el identificador e invalida el anterior", async () => {
    const { service, repository } = createTestService();

    const updated = await service.update("user-1", {
      handleName: "fabio-nuevo"
    });

    expect(updated.handleName).toBe("fabio-nuevo");
    expect(updated.url).toBe("http://localhost:5173/fabio-nuevo");

    expect(await repository.findByHandle("fabio-dev")).toBeNull();
    expect(await repository.findByHandle("fabio-nuevo")).not.toBeNull();
  });

  it("permite desactivar y reactivar el enlace", async () => {
    const { service } = createTestService();

    const disabled = await service.update("user-1", {
      publicLinkActive: false
    });

    expect(disabled.publicLinkActive).toBe(false);

    const enabled = await service.update("user-1", {
      publicLinkActive: true
    });

    expect(enabled.publicLinkActive).toBe(true);
  });

  it("rechaza un estado de activacion invalido", async () => {
    const { service } = createTestService();

    await expect(service.update("user-1", {
      publicLinkActive: "si"
    })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "INVALID_STATUS"
    });
  });

  it("rechaza modificar un usuario inexistente", async () => {
    const { service } = createTestService();

    await expect(service.update("inexistente", {
      publicLinkActive: true
    })).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "NOT_FOUND"
    });
  });
});
