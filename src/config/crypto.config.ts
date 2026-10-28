import { env } from "./env.config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1"

function getValidKey() {
  const rawKey = env.ENCRYPTION_KEY;
  if (!rawKey) throw new Error("variable de entorno ENCRYPTION_KEY no proporcionada");
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) 
    throw new Error("ENCRYPTION_KEY debe ser una cadena de 32 bytes codificados en base64"); 
  return key;
}

export const crypto = {
  algorithm: ALGORITHM,
  ivLength: IV_LENGTH,
  version: VERSION,
  key: getValidKey()
};