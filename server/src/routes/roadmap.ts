// Milestones and the roadmap of a project (/api/projects/:id/milestones, /api/projects/:id/roadmap) and "My work"
// (/api/my-work). The logic lives in services/roadmap.ts.
import { Router, type Request } from "express";
import { requireAuth } from "../lib/auth.js";
import * as svc from "../services/roadmap.js";
import { actorOf } from "../services/actor.js";

export { publicRoadmap, orgRoadmap } from "../services/roadmap.js";
const pid = (req: Request) => (req.params as { id: string }).id;

export const milestones = Router({ mergeParams: true });
milestones.use(requireAuth);
milestones.get("/", async (req, res) => { res.json(await svc.listMilestones(actorOf(req), pid(req))); });
milestones.post("/", async (req, res) => { res.status(201).json(await svc.createMilestone(actorOf(req), pid(req), req.body)); });
milestones.patch("/:milestoneId", async (req, res) => { res.json(await svc.updateMilestone(actorOf(req), pid(req), req.params.milestoneId, req.body)); });
milestones.delete("/:milestoneId", async (req, res) => { res.json(await svc.deleteMilestone(actorOf(req), pid(req), req.params.milestoneId)); });

export const roadmap = Router({ mergeParams: true });
roadmap.use(requireAuth);
roadmap.get("/", async (req, res) => { res.json(await svc.getRoadmap(actorOf(req), pid(req))); });
roadmap.post("/share", async (req, res) => { res.status(201).json(await svc.shareRoadmap(actorOf(req), pid(req))); });
roadmap.delete("/share", async (req, res) => { res.json(await svc.unshareRoadmap(actorOf(req), pid(req))); });

export const myWork = Router();
myWork.use(requireAuth);
myWork.get("/", async (req, res) => { res.json(await svc.myWork(actorOf(req), req.query.show)); });
