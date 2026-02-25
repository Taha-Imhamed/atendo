import multer from "multer";
import fs from "fs";
import path from "path";
import type { Request } from "express";

const uploadDir = path.resolve(process.cwd(), "uploads", "excuses");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) =>
    cb(null, uploadDir),
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${timestamp}-${sanitized}`);
  },
});

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error("Only PDF or image uploads are allowed"));
  }
  cb(null, true);
}

export const excuseUploadLimits = { fileSize: 5 * 1024 * 1024 };

export const excuseUpload = multer({
  storage,
  limits: excuseUploadLimits,
  fileFilter,
});

export const excuseUploadDir = uploadDir;

const rosterUploadDir = path.resolve(process.cwd(), "uploads", "rosters");
if (!fs.existsSync(rosterUploadDir)) {
  fs.mkdirSync(rosterUploadDir, { recursive: true });
}

const rosterStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) =>
    cb(null, rosterUploadDir),
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const owner = req.user?.id ?? "unknown";
    cb(null, `${owner}__${timestamp}__${sanitized}`);
  },
});

export const ALLOWED_ROSTER_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);

export function rosterFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExt = ext === ".xlsx" || ext === ".xls" || ext === ".csv";
  if (!ALLOWED_ROSTER_MIME.has(file.mimetype) && !allowedExt) {
    return cb(new Error("Only Excel or CSV uploads are allowed"));
  }
  cb(null, true);
}

export const rosterUpload = multer({
  storage: rosterStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: rosterFileFilter,
});

export const professorRosterUploadDir = rosterUploadDir;
