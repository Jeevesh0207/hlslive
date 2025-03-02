import express from "express";
import cors from "cors";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { exec } from "child_process";

const app = express();

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads");
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + "-" + uuidv4() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173","*"],
    credentials: true,
  })
);

// (Optional) Global CORS headers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // adjust as needed
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use("/uploads", express.static("uploads"));

app.get("/", function (req, res) {
  res.json({ message: "Hello, World!" });
});

// HLS upload endpoint
app.post("/upload", upload.single("file"), function (req, res) {
  const lessonId = uuidv4();
  const videoPath = req.file.path;
  const outputPath = `./uploads/courses/${lessonId}`;
  const masterPlaylist = `${outputPath}/index.m3u8`;

  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  const ffmpegCommand = `ffmpeg -i "${videoPath}" \
  -filter_complex "[0:v]split=3[v1][v2][v3];[v1]scale=1920:1080[v1out];[v2]scale=1280:720[v2out];[v3]scale=854:480[v3out]" \
  -map "[v1out]" -map 0:a -c:v libx264 -b:v 5000k -preset fast -c:a aac -hls_time 10 -hls_playlist_type vod \
  -hls_segment_filename "${outputPath}/1080p_%03d.ts" "${outputPath}/1080p.m3u8" \
  -map "[v2out]" -map 0:a -c:v libx264 -b:v 2500k -preset fast -c:a aac -hls_time 10 -hls_playlist_type vod \
  -hls_segment_filename "${outputPath}/720p_%03d.ts" "${outputPath}/720p.m3u8" \
  -map "[v3out]" -map 0:a -c:v libx264 -b:v 1000k -preset fast -c:a aac -hls_time 10 -hls_playlist_type vod \
  -hls_segment_filename "${outputPath}/480p_%03d.ts" "${outputPath}/480p.m3u8" \
  && echo "#EXTM3U
  #EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
  1080p.m3u8
  #EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
  720p.m3u8
  #EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
  480p.m3u8" > "${masterPlaylist}"`;

  exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: "Video processing failed" });
    }
    console.log("FFmpeg stdout:", stdout);
    console.log("FFmpeg stderr:", stderr);

    const videoUrl = `http://localhost:8000/uploads/courses/${lessonId}/index.m3u8`;
    res.json({
      message: "Video converted to HLS with multiple qualities",
      videoUrl,
      lessonId,
    });
  });
});

app.listen(8000, function () {
  console.log("App is listening at port 8000...");
});
