import { env } from "./env.config";

export const crypto = {
  algorithm: "aes-256-gcm",
  ivLength: 12,
  version: "v1",
  get key(): Buffer {
    const key = Buffer.from(env.ENCRYPTION_KEY ?? "", "base64");
    if (key.length !== 32) {
      throw new Error("ENCRYPTION_KEY debe contener 32 bytes codificados en base64");
    }
    return key;
  },
};
