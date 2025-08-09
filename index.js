const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const uploadDir = path.join(__dirname, "uploads");
const chunksDir = path.join(uploadDir, "chunks");

// Ensure directories exist
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(chunksDir, { recursive: true });

// Multer setup for chunk uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, chunksDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, "public")));

// Endpoint to handle chunk uploads
app.post("/upload", upload.single("chunk"), (req, res) => {
  const { chunkIndex, totalChunks, fileName } = req.body;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tempDir = path.join(chunksDir, safeName);

  fs.mkdirSync(tempDir, { recursive: true });

  // Move chunk into temp folder
  const chunkPath = path.join(tempDir, chunkIndex);
  fs.renameSync(req.file.path, chunkPath);

  // Merge when all chunks are uploaded
  const uploadedChunks = fs.readdirSync(tempDir);
  if (uploadedChunks.length == totalChunks) {
    const finalPath = path.join(uploadDir, safeName);
    const writeStream = fs.createWriteStream(finalPath);

    uploadedChunks
      .sort((a, b) => Number(a) - Number(b))
      .forEach(chunkFile => {
        const chunkData = fs.readFileSync(path.join(tempDir, chunkFile));
        writeStream.write(chunkData);
        fs.unlinkSync(path.join(tempDir, chunkFile));
      });

    writeStream.end();
    fs.rmdirSync(tempDir);
  }

  res.send("OK");
});

// Delete file
app.get("/delete", (req, res) => {
  const target = path.basename(req.query.delete || "");
  const filePath = path.join(uploadDir, target);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.redirect("/admin.html");
});

// List videos
app.get("/videos", (req, res) => {
  const videos = fs
    .readdirSync(uploadDir)
    .filter(f => /\.(mp4|webm|ogg)$/i.test(f));
  res.json(videos);
});

// Stream video with range support
app.get("/stream/:file", (req, res) => {
  const filePath = path.join(uploadDir, path.basename(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  let start = 0;
  let end = fileSize - 1;

  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      start = parseInt(match[1], 10);
      if (match[2]) end = parseInt(match[2], 10);
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".webm"
      ? "video/webm"
      : ext === ".ogg" || ext === ".ogv"
      ? "video/ogg"
      : "video/mp4";

  res.setHeader("Content-Type", mime);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", end - start + 1);
  res.setHeader("Cache-Control", "public, max-age=2592000");

  const stream = fs.createReadStream(filePath, { start, end });
  stream.pipe(res);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);