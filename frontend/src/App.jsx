import React, { useState, useRef } from "react";

/*
 * ────────────────────────────────────────────────────────────
 *  IMPORTANT:  Replace the URL below with the one Render
 *              gives you after you deploy the backend.
 * ────────────────────────────────────────────────────────────
 */
const API_BASE = "https://deeplivecam.onrender.com";

export default function App() {
  const [sourceFile, setSourceFile] = useState(null);
  const [targetFile, setTargetFile] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [targetPreview, setTargetPreview] = useState(null);
  const [status, setStatus] = useState(null);       // { type, msg }
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState(null);
  const [resultIsImage, setResultIsImage] = useState(false);

  const sourceRef = useRef();
  const targetRef = useRef();

  /* ── File handlers ───────────────────────────────────────── */
  const handleSource = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSourceFile(file);
    setSourcePreview(URL.createObjectURL(file));
    setResultUrl(null);
  };

  const handleTarget = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setTargetFile(file);
    setTargetPreview(URL.createObjectURL(file));
    setResultUrl(null);
    setResultIsImage(file.type.startsWith("image/"));
  };

  /* ── Upload & process ────────────────────────────────────── */
  const handleProcess = async () => {
    if (!sourceFile || !targetFile) {
      setStatus({ type: "error", msg: "Please select both a source face image and a target file." });
      return;
    }

    setProcessing(true);
    setStatus({ type: "info", msg: "Uploading files to the server…" });
    setProgress(10);
    setResultUrl(null);

    try {
      const form = new FormData();
      form.append("source", sourceFile);
      form.append("target", targetFile);

      setProgress(25);
      setStatus({ type: "info", msg: "Processing — this may take a few minutes…" });

      const resp = await fetch(`${API_BASE}/process`, {
        method: "POST",
        body: form,
      });

      setProgress(90);

      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        throw new Error(errData?.error || `Server error ${resp.status}`);
      }

      const data = await resp.json();
      setProgress(100);
      setResultUrl(data.output_url);
      setStatus({ type: "success", msg: "Done! Your processed file is ready." });
    } catch (err) {
      setStatus({ type: "error", msg: `Processing failed: ${err.message}` });
      setProgress(0);
    } finally {
      setProcessing(false);
    }
  };

  /* ── Status icon helper ──────────────────────────────────── */
  const statusIcon = (type) => {
    if (type === "info") return "⏳";
    if (type === "success") return "✅";
    if (type === "error") return "❌";
    return "";
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <span className="header__badge">AI-Powered</span>
        <h1 className="header__title">Deep Live Cam</h1>
        <p className="header__subtitle">
          Upload a source face and a target image / video — get an instant face swap.
        </p>
      </header>

      {/* Upload card */}
      <section className="card">
        <h2 className="card__title">Upload Files</h2>

        <div className="upload-grid">
          {/* Source face */}
          <div
            className={`upload-zone ${sourceFile ? "upload-zone--active" : ""}`}
            onClick={() => sourceRef.current?.click()}
          >
            <input
              ref={sourceRef}
              type="file"
              accept="image/*"
              onChange={handleSource}
            />
            <div className="upload-zone__icon">🧑</div>
            <div className="upload-zone__label">Source Face</div>
            <div className="upload-zone__hint">PNG, JPG — a clear face photo</div>
            {sourceFile && (
              <div className="upload-zone__file-name">{sourceFile.name}</div>
            )}
            {sourcePreview && (
              <img
                className="upload-zone__preview"
                src={sourcePreview}
                alt="Source preview"
              />
            )}
          </div>

          {/* Target video / image */}
          <div
            className={`upload-zone ${targetFile ? "upload-zone--active" : ""}`}
            onClick={() => targetRef.current?.click()}
          >
            <input
              ref={targetRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleTarget}
            />
            <div className="upload-zone__icon">🎬</div>
            <div className="upload-zone__label">Target Video / Image</div>
            <div className="upload-zone__hint">MP4, MKV, PNG, JPG</div>
            {targetFile && (
              <div className="upload-zone__file-name">{targetFile.name}</div>
            )}
            {targetPreview && !targetFile?.type.startsWith("video/") && (
              <img
                className="upload-zone__preview"
                src={targetPreview}
                alt="Target preview"
              />
            )}
            {targetPreview && targetFile?.type.startsWith("video/") && (
              <video
                className="upload-zone__preview"
                src={targetPreview}
                muted
                playsInline
              />
            )}
          </div>
        </div>

        {/* Process button */}
        <button
          className="process-btn"
          disabled={processing || !sourceFile || !targetFile}
          onClick={handleProcess}
        >
          {processing && <span className="spinner" />}
          {processing ? "Processing…" : "🚀 Start Face Swap"}
        </button>

        {/* Progress bar */}
        {processing && (
          <div className="progress-wrap">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* Status */}
        {status && (
          <div className={`status-bar status-bar--${status.type}`}>
            <span>{statusIcon(status.type)}</span>
            <span>{status.msg}</span>
          </div>
        )}
      </section>

      {/* Result card */}
      {resultUrl && (
        <section className="card result">
          <h2 className="card__title">Result</h2>
          {resultIsImage ? (
            <img src={resultUrl} alt="Processed result" />
          ) : (
            <video src={resultUrl} controls playsInline />
          )}
          <a
            className="result__download"
            href={resultUrl}
            download
            target="_blank"
            rel="noreferrer"
          >
            ⬇ Download Result
          </a>
        </section>
      )}

      {/* Footer */}
      <footer className="footer">
        Deep Live Cam · Powered by InsightFace &amp; ONNX Runtime
      </footer>
    </div>
  );
}
