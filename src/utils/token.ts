import { createCipheriv, createDecipheriv, randomBytes, CipherGCM, DecipherGCM } from "node:crypto";
import { crypto } from "../config/crypto.config";

export function encryptToken(token: string): string {
  const iv = randomBytes(crypto.ivLength);
  const cipher = createCipheriv(crypto.algorithm, crypto.key, iv) as CipherGCM;
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [crypto.version, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptToken(token: string): string {
  const [version, iv64, tag64, data64, extra] = token.split(":");
  if (version !== crypto.version || !iv64 || !tag64 || !data64 || extra !== undefined) {
    throw new Error("Formato de token invalido");
  }
  const iv = Buffer.from(iv64, "base64");
  const tag = Buffer.from(tag64, "base64");
  if (iv.length !== crypto.ivLength || tag.length !== 16) {
    throw new Error("Formato de token invalido");
  }
  const decipher = createDecipheriv(crypto.algorithm, crypto.key, iv) as DecipherGCM;
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(data64, "base64")), decipher.final()]).toString("utf8");
}
