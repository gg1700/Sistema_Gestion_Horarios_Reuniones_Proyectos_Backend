import { Router } from "express";
import * as MulterCheck from "../middlewares/multer.middleware";
import * as SharpCheck from "../middlewares/sharp.middleware";
import * as Validations from "../middlewares/validations.middleware";
import * as ProfileController from "../controllers/profile.controller";

const router = Router();

router.patch(
  "/",
  MulterCheck.checkMulterErrors,
  SharpCheck.verifyProfilePictureDimensions,
  Validations.modifyPersonalInfo,
  ProfileController.modifyPersonalInfo);

export default router;