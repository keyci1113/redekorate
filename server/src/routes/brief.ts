// The daily brief: /api/brief. The logic lives in services/brief.ts.
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { actorOf } from "../services/actor.js";
import * as svc from "../services/brief.js";

export const brief = Router();
brief.use(requireAuth);
brief.get("/", async (req, res) => { res.json(await svc.getBrief(actorOf(req), req.query)); });
brief.get("/status", async (req, res) => { res.json(await svc.briefStatus(actorOf(req))); });
brief.post("/seen", async (req, res) => { res.json(await svc.markBriefSeen(actorOf(req))); });
