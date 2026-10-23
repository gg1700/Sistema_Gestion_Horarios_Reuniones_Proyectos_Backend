import { Router } from "express";
import * as MulterCheck from "../middlewares/multer.middleware";
import * as SharpCheck from "../middlewares/sharp.middleware";
import * as Validations from "../middlewares/validations.middleware";
import * as Session from "../middlewares/session.middleware";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import * as ProfileController from "../controllers/profile.controller";
import * as VisibilityController from "../controllers/visibility.controller";

const router = Router();

router.get(
  "/",
  Session.verifySession,
  Session.requireActiveProfileUser,
  ProfileController.getOwnProfile
);

router.get(
  "/visibility",
  Session.verifySession,
  RateLimit.visibilityRateLimit,
  VisibilityController.getVisibility
);

router.patch(
  "/visibility",
  Session.verifySession,
  RateLimit.visibilityRateLimit,
  VisibilityController.updateVisibility
);

router.post(
  "/",
  Session.verifySession,
  RateLimit.profileRateLimit,
  MulterCheck.checkMulterErrors,
  SharpCheck.verifyProfilePictureDimensions,
  Validations.createAdditionalInfo,
  ProfileController.createAdditionalInfo
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