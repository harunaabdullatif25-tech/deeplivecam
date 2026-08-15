import React, { useState, useRef, useEffect } from "react";

const API_BASE = "https://deeplivecam.onrender.com";

export default function App() {
  /* ── State ────────────────────────────────────────────────── */
  const [sourceFile, setSourceFile] = useState(null);
  const [targetFile, setTargetFile] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [targetPreview, setTargetPreview] = useState(null);
  const [status, setStatus] = useState(null);       // { type, msg }
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState(null);
  const [resultIsImage, setResultIsImage] = useState(false);

  /* Options panel state */
  const [enhancer, setEnhancer] = useState("face_enhancer_gpen256");
  const [manyFaces, setManyFaces] = useState(true);
  const [mouthMask, setMouthMask] = useState(false);
  const [keepAudio, setKeepAudio] = useState(true);
  const [keepFps, setKeepFps] = useState(false);
  const [nsfwFilter, setNsfwFilter] = useState(false);

  /* Live Camera state */
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraTargetMode, setCameraTargetMode] = useState("target"); // "source" or "target"
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const sourceRef = useRef();
  const targetRef = useRef();
  const videoRef = useRef();
  const streamRef = useRef();
  const mediaRecorderRef = useRef();
  const recordedChunksRef = useRef([]);
  const timerRef = useRef();

  /* ── Camera setup ────────────────────────────────────────── */
  const openCamera = async (mode) => {
    setCameraTargetMode(mode);
    setCameraActive(true);
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devs.filter((d) => d.kind === "videoinput");
      setDevices(videoDevs);
      if (videoDevs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevs[0].deviceId);
      }
      await startStream(selectedDeviceId || (videoDevs[0] && videoDevs[0].deviceId));
    } catch (err) {
      setStatus({ type: "error", msg: `Camera access denied: ${err.message}` });
      setCameraActive(false);
    }
  };

  const startStream = async (deviceId) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera stream error:", err);
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (isRecording) {
      stopRecording();
    }
    setCameraActive(false);
  };

  const handleDeviceChange = (e) => {
    const devId = e.target.value;
    setSelectedDeviceId(devId);
    startStream(devId);
  };

  /* Capture Photo from Camera */
  const snapPhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      const file = new File([blob], `live_camera_${Date.now()}.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      if (cameraTargetMode === "source") {
        setSourceFile(file);
        setSourcePreview(url);
      } else {
        setTargetFile(file);
        setTargetPreview(url);
        setResultIsImage(true);
      }
      setResultUrl(null);
      closeCamera();
    }, "image/jpeg", 0.95);
  };

  /* Record Live Video Clip from Camera */
  const startRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const mr = new MediaRecorder(streamRef.current, { mimeType });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const file = new File([blob], `live_record_${Date.now()}.webm`, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setTargetFile(file);
        setTargetPreview(url);
        setResultIsImage(false);
        setResultUrl(null);
        closeCamera();
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert(`Recording error: ${err.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  /* Cleanup camera on unmount */
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /* ── File Upload Handlers ────────────────────────────────── */
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

  /* ── Upload & Process ────────────────────────────────────── */
  const handleProcess = async () => {
    if (!sourceFile || !targetFile) {
      setStatus({ type: "error", msg: "Please select both a source face image and a target file." });
      return;
    }

    setProcessing(true);
    setStatus({ type: "info", msg: "Uploading files and initializing face swap..." });
    setProgress(15);
    setResultUrl(null);

    try {
      const form = new FormData();
      form.append("source", sourceFile);
      form.append("target", targetFile);

      // Frame processors
      form.append("frame_processors", "face_swapper");
      if (enhancer !== "none") {
        form.append("frame_processors", enhancer);
      }

      form.append("many_faces", manyFaces ? "true" : "false");
      form.append("mouth_mask", mouthMask ? "true" : "false");
      form.append("keep_audio", keepAudio ? "true" : "false");
      form.append("keep_fps", keepFps ? "true" : "false");
      form.append("nsfw_filter", nsfwFilter ? "true" : "false");

      setProgress(35);
      setStatus({ type: "info", msg: "Processing — applying face swap models..." });

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
      setStatus({ type: "success", msg: "Done! Your processed face swap is ready." });
    } catch (err) {
      setStatus({ type: "error", msg: `Processing failed: ${err.message}` });
      setProgress(0);
    } finally {
      setProcessing(false);
    }
  };

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
        <span className="header__badge">AI Face Swap</span>
        <h1 className="header__title">Deep Live Cam</h1>
        <p className="header__subtitle">
          Upload face photos/videos or use your Live Camera for real-time AI face swapping.
        </p>
      </header>

      {/* Main Upload & Camera Card */}
      <section className="card">
        <h2 className="card__title">Input Selection</h2>

        <div className="upload-grid">
          {/* Source Face */}
          <div className="upload-box">
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
              <div className="upload-zone__label">Select a Face</div>
              <div className="upload-zone__hint">PNG, JPG — clear face photo</div>
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

            <button
              className="cam-btn"
              onClick={() => openCamera("source")}
              type="button"
            >
              📷 Snap Face with Camera
            </button>
          </div>

          {/* Target Video / Image */}
          <div className="upload-box">
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
              <div className="upload-zone__label">Select a Target</div>
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

            <button
              className="cam-btn cam-btn--primary"
              onClick={() => openCamera("target")}
              type="button"
            >
              📹 Record / Snap Target Camera
            </button>
          </div>
        </div>

        {/* ── Options & Refinement Controls ───────────────────── */}
        <div className="options-panel">
          <h3 className="options-panel__title">⚙️ Options &amp; Refinement</h3>

          <div className="options-grid">
            {/* Toggles */}
            <div className="option-item">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={keepAudio}
                  onChange={(e) => setKeepAudio(e.target.checked)}
                />
                <span className="toggle__slider" />
                <span className="toggle__label">Keep Audio</span>
              </label>
            </div>

            <div className="option-item">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={manyFaces}
                  onChange={(e) => setManyFaces(e.target.checked)}
                />
                <span className="toggle__slider" />
                <span className="toggle__label">Many Faces</span>
              </label>
            </div>

            <div className="option-item">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={mouthMask}
                  onChange={(e) => setMouthMask(e.target.checked)}
                />
                <span className="toggle__slider" />
                <span className="toggle__label">Mouth Mask</span>
              </label>
            </div>

            <div className="option-item">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={keepFps}
                  onChange={(e) => setKeepFps(e.target.checked)}
                />
                <span className="toggle__slider" />
                <span className="toggle__label">Keep Original FPS</span>
              </label>
            </div>

            <div className="option-item">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={nsfwFilter}
                  onChange={(e) => setNsfwFilter(e.target.checked)}
                />
                <span className="toggle__slider" />
                <span className="toggle__label">NSFW Filter</span>
              </label>
            </div>

            {/* Face Enhancer dropdown */}
            <div className="option-item option-item--select">
              <label className="option-label">Face Enhancer:</label>
              <select
                className="select-input"
                value={enhancer}
                onChange={(e) => setEnhancer(e.target.value)}
              >
                <option value="none">None (Disabled)</option>
                <option value="face_enhancer_gpen256">GPEN-256 (Fast)</option>
                <option value="face_enhancer_gpen512">GPEN-512 (High Quality)</option>
                <option value="face_enhancer">GFPGAN v1.4</option>
              </select>
            </div>
          </div>
        </div>

        {/* Process button */}
        <button
          className="process-btn"
          disabled={processing || !sourceFile || !targetFile}
          onClick={handleProcess}
        >
          {processing && <span className="spinner" />}
          {processing ? "Processing Face Swap…" : "🚀 Start Face Swap"}
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
          <h2 className="card__title">Result Preview</h2>
          {resultIsImage ? (
            <img src={resultUrl} alt="Processed result" />
          ) : (
            <video src={resultUrl} controls playsInline autoPlay />
          )}
          <a
            className="result__download"
            href={resultUrl}
            download
            target="_blank"
            rel="noreferrer"
          >
            ⬇ Download Result File
          </a>
        </section>
      )}

      {/* Live Camera Modal */}
      {cameraActive && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>📷 Live Camera ({cameraTargetMode === "source" ? "Source Face" : "Target Input"})</h3>
              <button className="modal-close" onClick={closeCamera}>✕</button>
            </div>

            {/* Camera Select */}
            {devices.length > 1 && (
              <div className="camera-select-row">
                <label>Select Camera: </label>
                <select value={selectedDeviceId} onChange={handleDeviceChange}>
                  {devices.map((d, idx) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Video Feed */}
            <div className="camera-viewport">
              <video ref={videoRef} autoPlay playsInline muted />
              {isRecording && (
                <div className="rec-badge">
                  🔴 REC ({recordSeconds}s)
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="camera-actions">
              <button className="cam-action-btn" onClick={snapPhoto} disabled={isRecording}>
                📸 Snap Photo
              </button>

              {cameraTargetMode === "target" && (
                !isRecording ? (
                  <button className="cam-action-btn cam-action-btn--rec" onClick={startRecording}>
                    ⏺ Start Recording Clip
                  </button>
                ) : (
                  <button className="cam-action-btn cam-action-btn--stop" onClick={stopRecording}>
                    ⏹ Stop &amp; Save Clip
                  </button>
                )
              )}

              <button className="cam-action-btn cam-action-btn--cancel" onClick={closeCamera}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        Deep Live Cam · Powered by InsightFace &amp; ONNX Runtime
      </footer>
    </div>
  );
}
