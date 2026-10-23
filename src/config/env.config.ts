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
  LOCAL_DB_URL: verifyEnvVariables("LOCAL_DB_URL", undefined),
  GOOGLE_CLIENT_ID: verifyEnvVariables("GOOGLE_CLIENT_ID", undefined),
  GOOGLE_CLIENT_SECRET: verifyEnvVariables("GOOGLE_CLIENT_SECRET", undefined),
  GITHUB_CLIENT_ID: verifyEnvVariables("GITHUB_CLIENT_ID", undefined),
  GITHUB_CLIENT_SECRET: verifyEnvVariables("GITHUB_CLIENT_SECRET", undefined),
  CLOUDINARY_CLOUD_NAME: verifyEnvVariables("CLOUDINARY_CLOUD_NAME", undefined),
  CLOUDINARY_API_KEY: verifyEnvVariables("CLOUDINARY_API_KEY", undefined),
  CLOUDINARY_API_SECRET: verifyEnvVariables("CLOUDINARY_API_SECRET", undefined),
  ENCRYPTION_KEY: verifyEnvVariables("ENCRYPTION_KEY", undefined),
};