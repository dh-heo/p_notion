import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = join(__dirname, "..", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extname(file.originalname) || ".png"}`);
  },
});

const uploadMw = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

export const upload = Router();

upload.post("/upload", uploadMw.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "no file" });
    return;
  }
  // multer는 originalname을 latin1로 디코드하므로 한글 파일명을 위해 utf8로 보정
  const name = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  res.status(201).json({
    src: `/uploads/${req.file.filename}`,
    name,
    size: req.file.size,
  });
});
