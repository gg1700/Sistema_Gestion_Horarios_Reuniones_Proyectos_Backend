import { createCipheriv, randomBytes, CipherGCM, createDecipheriv, DecipherGCM } from "node:crypto";
import { crypto } from "../config/crypto.config";

export function encryptToken(token: string) {
  const iv = randomBytes(crypto.ivLength);
  const cipher = createCipheriv(crypto.algorithm, crypto.key, iv) as CipherGCM;
  const encryptedToken = Buffer.concat([cipher.update(token, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    crypto.version,
    iv.toString("base64"),
    tag.toString("base64"),
    encryptedToken.toString("base64")
  ].join(":");
}

export function decryptToken(token: string) {
  const encryptedParts = token.split(":");
  if (encryptedParts.length !== 4 || encryptedParts[0] !== crypto.version)
    throw new Error("Formato de token invalido");
  const [ , iv64, tag64, token64 ] = encryptedParts;
  try {
    const iv = Buffer.from(iv64, "base64");
    const tag = Buffer.from(tag64, "base64");
    const encryptedData = Buffer.from(token64, "base64");
    const decipher = createDecipheriv(crypto.algorithm, crypto.key, iv) as DecipherGCM;
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]).toString("utf-8");
  } catch {
    throw new Error("Error al descifrar el token");
  }
}