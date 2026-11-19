import { Router } from "express";
import { customAlphabet } from "nanoid";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import * as svc from "../services/studies.js";
import { actorOf } from "../services/actor.js";

export const studies = Router();
studies.use(requireAuth);

const tokenId = customAlphabet("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 24);
const ownStudy = (id: string, req: Parameters<typeof actorOf>[0], min?: "viewer" | "editor") => svc.studyFor(actorOf(req), id, min);

// The study itself: services/studies.ts. Opening it in the builder or the results notes the visit for the home page.
studies.post("/", async (req, res) => { res.status(201).json(await svc.createStudy(actorOf(req), req.body)); });
studies.get("/:id", async (req, res) => { res.json(await svc.getStudy(actorOf(req), req.params.id, { noteOpen: true })); });
studies.patch("/:id", async (req, res) => { res.json(await svc.updateStudy(actorOf(req), req.params.id, req.body)); });
studies.post("/:id/status", async (req, res) => { res.json(await svc.setStudyStatus(actorOf(req), req.params.id, req.body)); });
studies.post("/:id/publish", async (req, res) => { res.json(await svc.publishStudy(actorOf(req), req.params.id)); });
studies.get("/:id/versions", async (req, res) => { res.json(await svc.listStudyVersions(actorOf(req), req.params.id)); });
studies.post("/:id/versions/:vid/restore", async (req, res) => { res.json(await svc.restoreStudyVersion(actorOf(req), req.params.id, req.params.vid)); });
studies.post("/:id/duplicate", async (req, res) => { res.status(201).json(await svc.duplicateStudy(actorOf(req), req.params.id)); });
studies.delete("/:id", async (req, res) => { res.json(await svc.deleteStudy(actorOf(req), req.params.id)); });
studies.get("/:id/results", async (req, res) => { res.json(await svc.studyResults(actorOf(req), req.params.id, { noteOpen: true })); });
studies.delete("/:id/sessions/:sid", async (req, res) => { res.json(await svc.deleteSession(actorOf(req), req.params.id, req.params.sid)); });
studies.get("/:id/recordings/:sid", async (req, res) => { res.type("application/json").send(await svc.recordingJson(actorOf(req), req.params.id, req.params.sid)); });
studies.delete("/:id/recordings/:sid", async (req, res) => { res.json(await svc.deleteRecording(actorOf(req), req.params.id, req.params.sid)); });

// Report links for one study (web app only).
studies.get("/:id/shares", async (req, res) => {
  await ownStudy(req.params.id, req);
  res.json({ shares: await query("select * from report_shares where study_id = $1 and revoked_at is null order by created_at desc", [req.params.id]) });
});

studies.post("/:id/shares", async (req, res) => {
  await ownStudy(req.params.id, req, "editor");
  const share = await one("insert into report_shares(study_id, token) values ($1,$2) returning *", [req.params.id, tokenId()]);
  res.status(201).json({ share });
});

studies.delete("/:id/shares/:shareId", async (req, res) => {
  await ownStudy(req.params.id, req, "editor");
  await query("update report_shares set revoked_at = now() where id = $1 and study_id = $2", [req.params.shareId, req.params.id]);
  res.json({ ok: true });
});
