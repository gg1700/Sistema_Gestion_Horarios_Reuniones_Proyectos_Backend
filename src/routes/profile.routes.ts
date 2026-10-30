import { Router } from "express";
import * as MulterCheck from "../middlewares/multer.middleware";
import * as SharpCheck from "../middlewares/sharp.middleware";
import * as Validations from "../middlewares/validations.middleware";
import * as Session from "../middlewares/session.middleware";
import * as RateLimit from "../middlewares/rateLimit.middleware";
import * as ProfileController from "../controllers/profile.controller";
import * as VisibilityController from "../controllers/visibility.controller";
import { deleteAccount } from "../controllers/account-deletion.controller";
import { requireRepositoryOrigin } from "../middlewares/repository-origin.middleware";
import { getProfilePreview } from "../controllers/profilePreview.controller";

const router = Router();

router.delete(
  "/",
  RateLimit.deleteAccountRateLimit,
  Session.verifySession,
  Session.requireActiveProfileUser,
  deleteAccount
);

router.use(Session.verifySession, Session.requireActiveProfileUser);

router.get(
  "/preview",
  RateLimit.visibilityRateLimit,
  getProfilePreview
);

router.get(
  "/",
  ProfileController.getOwnProfile
);

router.get(
  "/visibility",
  RateLimit.visibilityRateLimit,
  VisibilityController.getVisibility
);

router.patch(
  "/visibility",
  requireRepositoryOrigin,
  RateLimit.visibilityRateLimit,
  VisibilityController.updateVisibility
);

router.post(
  "/",
  RateLimit.profileRateLimit,
  MulterCheck.checkMulterErrors,
  SharpCheck.verifyProfilePictureDimensions,
  Validations.createAdditionalInfo,
  ProfileController.createAdditionalInfo
);

router.patch(
  "/",
  RateLimit.profileRateLimit,
  MulterCheck.checkMulterErrors,
  SharpCheck.verifyProfilePictureDimensions,
  Validations.modifyPersonalInfo,
  ProfileController.modifyPersonalInfo
);

router.patch(
  "/work-experience/:id",
  RateLimit.profileRateLimit,
  Validations.modifyWorkExperience,
  ProfileController.modifyWorkExperience
);

export default router;
