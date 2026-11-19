// Tickets of a project: /api/projects/:id/tickets. The logic lives in services/tickets.ts.
import { Router, type Request } from "express";
import { requireAuth } from "../lib/auth.js";
import * as svc from "../services/tickets.js";
import { actorOf } from "../services/actor.js";

export const tickets = Router({ mergeParams: true });
tickets.use(requireAuth);

const pid = (req: Request) => (req.params as { id: string }).id;
const num = (req: Request) => (req.params as { number: string }).number;

tickets.get("/", async (req, res) => { res.json(await svc.listTickets(actorOf(req), pid(req))); });
tickets.post("/", async (req, res) => { res.status(201).json(await svc.createTicket(actorOf(req), pid(req), req.body)); });
tickets.post("/move", async (req, res) => { res.json(await svc.moveTicket(actorOf(req), pid(req), req.body)); });
tickets.put("/columns", async (req, res) => { res.json(await svc.saveColumns(actorOf(req), pid(req), req.body)); });
tickets.delete("/columns", async (req, res) => { res.json(await svc.resetColumns(actorOf(req), pid(req))); });
tickets.post("/bulk", async (req, res) => { res.json(await svc.bulkEdit(actorOf(req), pid(req), req.body)); });
tickets.post("/delete", async (req, res) => { res.json(await svc.deleteTickets(actorOf(req), pid(req), req.body)); });

tickets.get("/:number", async (req, res) => { res.json(await svc.getTicket(actorOf(req), pid(req), num(req))); });
tickets.patch("/:number", async (req, res) => { res.json(await svc.updateTicket(actorOf(req), pid(req), num(req), req.body)); });
tickets.post("/:number/links", async (req, res) => { res.status(201).json(await svc.linkTicket(actorOf(req), pid(req), num(req), req.body)); });
tickets.delete("/:number/links/:linkId", async (req, res) => { res.json(await svc.unlinkTicket(actorOf(req), pid(req), num(req), req.params.linkId)); });
tickets.post("/:number/insight", async (req, res) => { res.status(201).json(await svc.convertToInsight(actorOf(req), pid(req), num(req), req.body)); });
tickets.post("/:number/comments", async (req, res) => { res.status(201).json(await svc.commentOnTicket(actorOf(req), pid(req), num(req), req.body)); });
tickets.patch("/:number/comments/:commentId", async (req, res) => { res.json(await svc.editComment(actorOf(req), pid(req), num(req), req.params.commentId, req.body)); });
tickets.delete("/:number/comments/:commentId", async (req, res) => { res.json(await svc.deleteComment(actorOf(req), pid(req), num(req), req.params.commentId)); });
tickets.post("/:number/merge", async (req, res) => { res.json(await svc.mergeTicket(actorOf(req), pid(req), num(req), req.body)); });
tickets.delete("/:number/reporter", async (req, res) => { res.json(await svc.eraseReporter(actorOf(req), pid(req), num(req))); });
tickets.delete("/:number/attachments", async (req, res) => { res.json(await svc.removeAttachment(actorOf(req), pid(req), num(req), req.body)); });
// Earlier descriptions, saved when the REST API or an AI app replaced one.
tickets.get("/:number/versions", async (req, res) => { res.json(await svc.listTicketVersions(actorOf(req), pid(req), num(req))); });
tickets.post("/:number/versions/:vid/restore", async (req, res) => { res.json(await svc.restoreTicketVersion(actorOf(req), pid(req), num(req), req.params.vid)); });
