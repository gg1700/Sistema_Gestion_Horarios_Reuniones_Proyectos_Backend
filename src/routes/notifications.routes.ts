import { Router } from "express";
import * as controller from "../controllers/notifications.controller";
import * as session from "../middlewares/session.middleware";

const router = Router();

router.use(session.verifySession, session.requireActiveProfileUser);
router.get("/", controller.listNotifications);
router.patch("/:notificationId/read", controller.markNotificationAsRead);

export default router;
