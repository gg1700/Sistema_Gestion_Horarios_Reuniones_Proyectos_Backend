import cloudinary from "../config/cloudinary.config";

export async function updateProfilePicture(
  userId: string,
  profilePicture: Buffer,
  imageMimeType: string) {
  try {
    const publicId = `profiles/user_${userId}`;
    const result = await cloudinary.uploader.upload(
      `data:${imageMimeType};base64,${profilePicture.toString("base64")}`,
      {
        public_id: publicId,
        overwrite: true,
        invalidate: true
      }
    );

    return result.secure_url;
  } catch (err) {
    throw new Error(`Error al actualizar foto de perfil: ${(err as Error).message}`);
  }
}