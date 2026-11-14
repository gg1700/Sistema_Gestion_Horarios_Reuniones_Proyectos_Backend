import { describe, expect, it } from "vitest";
import { validateEditablePersonalInfo } from "../src/validators/profile.validator";

const id = "11111111-1111-4111-8111-111111111111";

describe("Edicion del perfil con las reglas del registro", () => {
  it("acepta elementos existentes (con id) y nuevos (sin id)", () => {
    const result = validateEditablePersonalInfo({
      phones: [
        { id, phoneNumber: "71234567", countryCode: "591", visibility: true },
        { phoneNumber: "1123456789", countryCode: "+54" },
      ],
      links: [{ text: "portafolio", url: "mateo.dev" }],
      countries: [{ countryName: "argentina" }],
    });
    expect(result.phones).toEqual([
      { id, phoneNumber: "71234567", countryCode: "591", visibility: true },
      expect.objectContaining({ phoneNumber: "1123456789", countryCode: "54" }),
    ]);
    expect(result.links?.[0]).toMatchObject({ url: "https://mateo.dev/" });
    expect(result.countries?.[0]).toMatchObject({ countryName: "Argentina" });
  });

  it("valida los digitos segun el codigo de pais tambien al editar", () => {
    expect(() => validateEditablePersonalInfo({
      phones: [{ id, phoneNumber: "1123456789", countryCode: "591", visibility: true }],
    })).toThrow("+591 requiere");
  });

  it("respeta el maximo de telefonos y correos", () => {
    expect(() => validateEditablePersonalInfo({
      phones: [
        { phoneNumber: "71234567", countryCode: "591" },
        { phoneNumber: "71234568", countryCode: "591" },
        { phoneNumber: "71234569", countryCode: "591" },
      ],
    })).toThrow("maximo de 2");
  });

  it("una lista vacia significa quitar todos los elementos", () => {
    expect(validateEditablePersonalInfo({ phones: [], links: [] })).toEqual({ phones: [], links: [] });
  });
});
