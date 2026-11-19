// Insights: /api/insights. The logic lives in services/insights.ts.
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import * as svc from "../services/insights.js";
import { actorOf } from "../services/actor.js";

export const insights = Router();
insights.use(requireAuth);

insights.post("/", async (req, res) => { res.status(201).json(await svc.createInsight(actorOf(req), req.body)); });
insights.patch("/:id", async (req, res) => { res.json(await svc.updateInsight(actorOf(req), req.params.id, req.body)); });
insights.delete("/:id", async (req, res) => { res.json(await svc.deleteInsight(actorOf(req), req.params.id)); });
