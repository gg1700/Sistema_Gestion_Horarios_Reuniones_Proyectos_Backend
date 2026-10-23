
import { Router } from "express";
import * as MulterCheck from "../middlewares/multer.middleware";
import * as SharpCheck from "../middlewares/sharp.middleware";
import * as Validations from "../middlewares/validations.middleware";
import * as ProfileController from "../controllers/profile.controller";
import * as VisibilityController from "../controllers/visibility.controller";
import { verifyAuthentication } from "../middlewares/auth.middleware";
import { visibilityRateLimit } from "../middlewares/rateLimit.middleware";

const router = Router();

router.get(
  "/visibility",
  verifyAuthentication,
  visibilityRateLimit,
  VisibilityController.getVisibility
);

router.patch(
  "/visibility",
  verifyAuthentication,
  visibilityRateLimit,
  VisibilityController.updateVisibility
);

router.patch(
  "/",
  MulterCheck.checkMulterErrors,
  SharpCheck.verifyProfilePictureDimensions,
  Validations.modifyPersonalInfo,
  ProfileController.modifyPersonalInfo
);

router.patch(
  "/work-experience/:id",
  Validations.modifyWorkExperience,
  ProfileController.modifyWorkExperience
);

export default router;
