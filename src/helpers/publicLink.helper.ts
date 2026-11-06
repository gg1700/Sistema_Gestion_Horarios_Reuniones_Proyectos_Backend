export type HandleValidationResult =
  { valid: true; handleName: string } | { valid: false; error: string };

const handlePattern = /^[a-z0-9-]{3,50}$/;

const reservedHandles = new Set(["admin", "api", "login", "public"]);

export function validatePublicHandle(handle: unknown): HandleValidationResult {
  if (typeof handle !== "string" || !handlePattern.test(handle)) {
    return {
      valid: false,
      error:
        "El identificador debe tener entre 3 y 50 caracteres y usar únicamente letras minúsculas, números o guiones.",
    };
  }

  if (reservedHandles.has(handle)) {
    return {
      valid: false,
      error: "El identificador está reservado.",
    };
  }

  return {
    valid: true,
    handleName: handle,
  };
}
