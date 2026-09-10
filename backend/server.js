import express from "express";
import "dotenv/config";
import cors from "cors";
import path from "path";
import { extractArticle } from "./extractor.js";
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('__dirname:', __dirname);
console.log('projectRoot:', projectRoot);
const publicPath = path.join(projectRoot, 'public');
console.log('publicPath:', publicPath);
console.log('publicPath exists:', fs.existsSync(publicPath));
console.log('index.html exists:', fs.existsSync(path.join(publicPath, 'index.html')));

const app = express();
const PORT = process.env.PORT || 4001;

app.use(express.json({ limit: "1mb" }))
app.use(cors({ origin: "*", credentials: true }));

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// Static file serving
app.use(express.static(publicPath, { index: ['index.html'] }));
app.use("/articles", express.static(path.join(__dirname, "articles")));

app.get("/", (_req, res) => {
  console.log('[REQ] GET / -> redirect');
  res.redirect("/index.html");
});

app.post("/api/extract", async (req, res) => {
  console.log('[DEBUG] POST /api/extract received:', req.body);
  try {
    if (!req.body || typeof req.body !== "object" || !("url" in req.body)) {
      console.log('[DEBUG] Invalid input - missing url');
      return res.status(400).json({
        error: { type: "INVALID_INPUT", message: "Request body must contain a `url` property." },
      });
    }
    const { url } = req.body;
    console.log('[DEBUG] Extracting URL:', url);
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      console.log('[DEBUG] Invalid protocol');
      return res.status(400).json({
        error: { type: "INVALID_INPUT", message: "Only HTTP and HTTPS URLs are supported." },
      });
    }
    console.log('[DEBUG] Calling extractArticle...');
    const article = await extractArticle(url);
    console.log('[DEBUG] Extraction successful:', article.title);
    res.json({ success: true, article });
  } catch (err) {
    console.error("[EXTRACTOR] error:", err);
    console.error("[EXTRACTOR] stack:", err.stack);
    if (!res.headersSent) {
      res.status(500).json({
        error: { type: "EXTRACTION_FAILED", message: err.message || "Failed to extract article" },
      });
    }
  }
});

app.use((req, res) => {
  console.log('[404]', req.method, req.url);
  res.status(404).json({ error: "Not found" });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const server = http.createServer(app);
server.on('error', (err) => {
  console.error('Server error:', err);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 extractor listening on http://localhost:${PORT}`);
  console.log(`   Bound to 127.0.0.1:${PORT}`);
});