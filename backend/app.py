"""
Deep Live Cam – Flask API backend.

Accepts a source face image and a target image/video,
runs the Deep-Live-Cam face-swap pipeline in headless mode,
and returns the processed output.
"""

import os
import sys
import uuid
import shutil
import subprocess
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# ── App setup ──────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # allow the Vercel-hosted frontend to call this API

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
RESULT_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)

# Path to the Deep-Live-Cam run.py (sits at the project root, one level up)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN_SCRIPT = os.path.join(PROJECT_ROOT, "run.py")


# ── Helpers ────────────────────────────────────────────────────
def _is_image(filename: str) -> bool:
    return filename.lower().rsplit(".", 1)[-1] in {"png", "jpg", "jpeg", "bmp", "gif"}


def _is_video(filename: str) -> bool:
    return filename.lower().rsplit(".", 1)[-1] in {"mp4", "mkv", "avi", "mov", "webm"}


def _output_ext(target_filename: str) -> str:
    """Mirror the target extension for the output file."""
    ext = target_filename.rsplit(".", 1)[-1].lower()
    if ext in {"png", "jpg", "jpeg", "bmp", "gif"}:
        return ext
    return "mp4"


# ── Routes ─────────────────────────────────────────────────────
@app.get("/")
def index():
    return jsonify(status="ok", message="Deep Live Cam API is running.")


@app.get("/health")
def health():
    return jsonify(status="healthy")


@app.post("/process")
def process():
    source = request.files.get("source")
    target = request.files.get("target")

    if not source:
        return jsonify(error="Missing 'source' file (face image)."), 400
    if not target:
        return jsonify(error="Missing 'target' file (image or video)."), 400

    job_id = str(uuid.uuid4())

    # Save uploads
    src_ext = source.filename.rsplit(".", 1)[-1] if "." in source.filename else "png"
    tgt_ext = target.filename.rsplit(".", 1)[-1] if "." in target.filename else "mp4"
    src_path = os.path.join(UPLOAD_DIR, f"{job_id}_source.{src_ext}")
    tgt_path = os.path.join(UPLOAD_DIR, f"{job_id}_target.{tgt_ext}")
    source.save(src_path)
    target.save(tgt_path)

    # Output path
    out_ext = _output_ext(target.filename)
    out_name = f"{job_id}_output.{out_ext}"
    out_path = os.path.join(RESULT_DIR, out_name)

    # Read optional configuration options from form data
    frame_processors = request.form.getlist("frame_processors")
    if not frame_processors:
        # Default frame processor
        frame_processors = ["face_swapper"]

    many_faces = request.form.get("many_faces", "false").lower() == "true"
    mouth_mask = request.form.get("mouth_mask", "false").lower() == "true"
    keep_audio = request.form.get("keep_audio", "true").lower() == "true"
    keep_fps = request.form.get("keep_fps", "false").lower() == "true"
    nsfw_filter = request.form.get("nsfw_filter", "false").lower() == "true"

    # Build the CLI command
    cmd = [
        sys.executable,         # python interpreter
        RUN_SCRIPT,
        "-s", src_path,         # source face
        "-t", tgt_path,         # target image/video
        "-o", out_path,         # output
        "--execution-provider", "cpu",
        "--frame-processor", *frame_processors,
    ]

    if many_faces:
        cmd.append("--many-faces")
    if mouth_mask:
        cmd.append("--mouth-mask")
    if keep_audio:
        cmd.append("--keep-audio")
    if keep_fps:
        cmd.append("--keep-fps")
    if nsfw_filter:
        cmd.append("--nsfw-filter")

    app.logger.info("Running: %s", " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,        # 10 minute ceiling
            cwd=PROJECT_ROOT,
        )
    except subprocess.TimeoutExpired:
        _cleanup(src_path, tgt_path)
        return jsonify(error="Processing timed out (10 min limit)."), 504

    if proc.returncode != 0:
        app.logger.error("STDERR: %s", proc.stderr[-2000:] if proc.stderr else "(empty)")
        _cleanup(src_path, tgt_path)
        return jsonify(error=f"Processing failed: {proc.stderr[-500:] if proc.stderr else 'unknown error'}"), 500

    if not os.path.isfile(out_path):
        _cleanup(src_path, tgt_path)
        return jsonify(error="Processing completed but no output file was created."), 500

    # Build public URL for the result
    output_url = f"{request.host_url.rstrip('/')}/results/{out_name}"

    # Clean up uploads (keep the result for download)
    _cleanup(src_path, tgt_path)

    return jsonify(output_url=output_url, job_id=job_id)


@app.get("/results/<path:filename>")
def serve_result(filename):
    """Serve processed output files."""
    return send_from_directory(RESULT_DIR, filename)


def _cleanup(*paths):
    """Delete temporary files silently."""
    for p in paths:
        try:
            os.remove(p)
        except OSError:
            pass


# ── Entry point ────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=False)
