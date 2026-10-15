import * as dotenv from 'dotenv'

dotenv.config();

function verifyEnvVariables(envVar: string, envValue: string | undefined): string {
  const value = process.env[envVar] || envValue;
  if (!value) {
    throw new Error(`Falta la variable de entorno: ${envVar}`);
  }
  return value;
}

export const env = {
  NODE_ENV: verifyEnvVariables("NODE_ENV", "development"),
  PORT: verifyEnvVariables("PORT", "3000"),
  DB_URL: verifyEnvVariables("DB_URL", undefined),
};