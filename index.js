const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 8080;

// ⚠️ Change this if you want external SD path
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Save chunks temporarily as files (no memory used)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, "__chunk.tmp")
});
const upload = multer({ storage });

app.use("/uploads", express.static(uploadDir));
// app.use("/public", express.static(path.join(__dirname, "public")));
app.use(express.static("public"));

app.get("/", (req, res) =>
    res.sendFile(path.join(__dirname, "public/index.html"))
);
app.get("/upload", (req, res) =>
    res.sendFile(path.join(__dirname, "public/upload.html"))
);

app.get("/files", (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send("Error reading files");
        res.json(files.filter(f => f.toLowerCase().endsWith(".mp4")));
    });
});

app.delete("/delete/:file", (req, res) => {
    const filePath = path.join(uploadDir, req.params.file);
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, err => {
            if (err) return res.status(500).send("Delete failed");
            res.sendStatus(200);
        });
    } else {
        res.status(404).send("File not found");
    }
});

app.post("/upload", upload.single("file"), (req, res) => {
    const start = parseInt(req.headers["x-start"]) || 0;
    const customName = req.headers["x-custom-name"];
    if (!customName) return res.status(400).send("Missing custom file name");

    const destPath = path.join(uploadDir, customName);
    const chunkPath = req.file.path;

    if (fs.existsSync(destPath) && start === 0) {
        fs.unlink(chunkPath, () => {});
        return res.status(400).send("File already exists");
    }

    const readStream = fs.createReadStream(chunkPath);
    const writeStream = fs.createWriteStream(destPath, { flags: "a" });

    readStream.pipe(writeStream);

    writeStream.on("finish", () => {
        fs.unlink(chunkPath, () => {});
        res.send(req.file.size.toString());
    });

    writeStream.on("error", () => {
        fs.unlink(chunkPath, () => {});
        res.status(500).send("Write error");
    });

    readStream.on("error", () => {
        fs.unlink(chunkPath, () => {});
        res.status(500).send("Read error");
    });
});

app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
);
