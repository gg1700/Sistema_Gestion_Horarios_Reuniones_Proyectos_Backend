import express, { Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import router from "../routes/server.routes";
import { env } from "./env.config";

export const app: Application = express();

app.use(cors({
  origin: new URL(env.FRONTEND_OAUTH_CALLBACK_URL).origin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser(env.COOKIE_SECRET));

app.use("/", router);