"""
speech.py — the voice seam. Mirrors providers.py (the model seam): one module,
pluggable speech-to-text + text-to-speech + voice-cloning backends, capability
detection, graceful "engine not installed" strings. Nothing above this file
knows which engine served a request.

Edge-portability: prefer ONNX / portable runtimes (faster_whisper, moonshine,
kokoro_onnx, piper) over Apple-only MLX where you can — this targets edge.
"""
import os, shutil, subprocess, tempfile, json, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
VOICES_DIR = os.path.join(HERE, "voices")

# module-level engine caches (lazy)
_FW = None          # faster-whisper model
_PK = None          # parakeet-mlx model
_KOKORO = None      # kokoro onnx pipeline
_KOKORO_MLX = None  # kokoro mlx pipeline

def _has(name): return importlib.util.find_spec(name) is not None

def capabilities():
    """What's available right now. The UI greys out / reports engines from this."""
    return {
        "stt": {
            "faster_whisper": _has("faster_whisper"),
            "whisper_cpp":    bool(shutil.which("whisper-cli") or shutil.which("whisper")),
            "moonshine":      _has("moonshine_onnx") or _has("moonshine"),
            "parakeet_mlx":   _has("parakeet_mlx"),
            "apple":          False,   # needs a Swift bridge — see handoff note
        },
        "tts": {
            "say":         bool(shutil.which("say")),
            "browser":     True,       # client-side; always available from server view
            "kokoro_onnx": _has("kokoro_onnx"),
            "kokoro_mlx":  _has("mlx_audio"),
            "piper":       bool(shutil.which("piper")),
        },
        "clone": { "f5": _has("f5_tts"), "xtts": _has("TTS") },
    }

def _wav_tmp(b):
    f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    f.write(b); f.close(); return f.name

# ── speech-to-text ────────────────────────────────────────────────────────────
def transcribe(audio_bytes, mime="audio/wav", engine="faster_whisper"):
    """16kHz-mono wav bytes (from providers.normalize_audio) -> text.
    Returns plain text, or an [stt ...] marker string on failure (model can react)."""
    try:
        fn = {
            "faster_whisper": _stt_faster_whisper,
            "whisper_cpp":    _stt_whisper_cpp,
            "moonshine":      _stt_moonshine,
            "parakeet_mlx":   _stt_parakeet_mlx,
        }.get(engine)
        if fn is None: return f"[stt: unknown engine '{engine}']"
        return fn(audio_bytes)
    except Exception as e:
        return f"[stt {engine} failed: {e}]"

def _stt_faster_whisper(b):
    if not _has("faster_whisper"):
        return "[stt faster_whisper: not installed — pip install faster-whisper]"
    global _FW
    from faster_whisper import WhisperModel
    if _FW is None:
        _FW = WhisperModel("base.en", device="cpu", compute_type="int8")
    p = _wav_tmp(b)
    try:
        segs, _ = _FW.transcribe(p, language="en")
        return " ".join(s.text.strip() for s in segs).strip()
    finally: os.remove(p)

def _stt_whisper_cpp(b):
    binary = shutil.which("whisper-cli") or shutil.which("whisper")
    if not binary:
        return "[stt whisper_cpp: binary not found — brew install whisper-cpp]"
    model = os.environ.get("WHISPER_CPP_MODEL", "")
    p = _wav_tmp(b)
    try:
        cmd = [binary, "-f", p, "-nt"] + (["-m", model] if model else [])
        out = subprocess.run(cmd, capture_output=True, text=True)
        return out.stdout.strip() or "[stt whisper_cpp: empty output]"
    finally: os.remove(p)

def _stt_moonshine(b):
    if not (_has("moonshine_onnx") or _has("moonshine")):
        return "[stt moonshine: not installed — pip install useful-moonshine-onnx]"
    import moonshine_onnx as mo          # verify package name on the box
    p = _wav_tmp(b)
    try: return mo.transcribe(p, "moonshine/base")[0].strip()
    finally: os.remove(p)

def _stt_parakeet_mlx(b):
    if not _has("parakeet_mlx"):
        return "[stt parakeet_mlx: not installed — pip install parakeet-mlx]"
    global _PK
    from parakeet_mlx import from_pretrained
    if _PK is None:
        _PK = from_pretrained("mlx-community/parakeet-tdt-0.6b-v3")
    p = _wav_tmp(b)
    try: return _PK.transcribe(p).text.strip()
    finally: os.remove(p)

# ── text-to-speech (SERVER-side engines; 'say'/'browser' handled by front-ends) ─
def synthesize(text, engine="kokoro_onnx", voice=""):
    """text -> (audio_bytes, mime) for server-side engines. (None, '[err]') on fail."""
    try:
        if engine == "kokoro_onnx": return _tts_kokoro_onnx(text, voice)
        if engine == "kokoro_mlx":  return _tts_kokoro_mlx(text, voice)
        if engine == "piper":       return _tts_piper(text, voice)
        if engine in ("f5", "xtts"):return _tts_clone(text, voice, engine)
        return (None, f"[tts: unknown server engine '{engine}']")
    except Exception as e:
        return (None, f"[tts {engine} failed: {e}]")

def _tts_kokoro_onnx(text, voice):
    if not _has("kokoro_onnx"):
        return (None, "[tts kokoro_onnx: not installed — pip install kokoro-onnx]")
    global _KOKORO
    from kokoro_onnx import Kokoro
    if _KOKORO is None:
        # expects kokoro-v1.0.onnx + voices-v1.0.bin in models/ (document for user)
        _KOKORO = Kokoro(os.path.join(HERE, "models", "kokoro-v1.0.onnx"),
                         os.path.join(HERE, "models", "voices-v1.0.bin"))
    import io as _io, wave, numpy as np
    samples, sr = _KOKORO.create(text, voice=voice or "af_sky", speed=1.0, lang="en-us")
    buf = _io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
    return (buf.getvalue(), "audio/wav")

_KOKORO_MLX_REPO = "prince-canuma/Kokoro-82M"

def _tts_kokoro_mlx(text, voice):
    if not _has("mlx_audio"):
        return (None, "[tts kokoro_mlx: not installed — pip install mlx-audio]")
    if not _has("misaki"):
        return (None, "[tts kokoro_mlx: requires misaki — pip install misaki]")
    global _KOKORO_MLX
    if _KOKORO_MLX is None:
        # mlx_audio's generic load_model can't identify Kokoro-82M (no model_type in
        # config.json); load the Model class directly from the HF snapshot instead.
        import json
        from huggingface_hub import snapshot_download
        import mlx.core as mx
        from mlx_audio.tts.models.kokoro.kokoro import Model, ModelConfig
        local = snapshot_download(_KOKORO_MLX_REPO)
        with open(os.path.join(local, "config.json")) as f:
            cfg = json.load(f)
        cfg.setdefault("sample_rate", 24000)
        model = Model(ModelConfig(**cfg), repo_id=_KOKORO_MLX_REPO)
        weights = mx.load(os.path.join(local, "kokoro-v1_0.safetensors"))
        model.load_weights(list(model.sanitize(weights).items()))
        mx.eval(model.parameters())
        _KOKORO_MLX = model
    import io as _io, wave, numpy as np
    sr = _KOKORO_MLX.config.sample_rate
    chunks = []
    for result in _KOKORO_MLX.generate(text, voice=voice or "af_sky"):
        if result.audio is not None:
            chunks.append(np.array(result.audio).flatten())
    if not chunks:
        return (None, "[tts kokoro_mlx: no audio generated]")
    samples = np.clip(np.concatenate(chunks), -1, 1)
    buf = _io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((samples * 32767).astype("<i2").tobytes())
    return (buf.getvalue(), "audio/wav")

def _tts_piper(text, voice):
    if not shutil.which("piper"):
        return (None, "[tts piper: binary not found — install piper + a .onnx voice]")
    model = voice or os.environ.get("PIPER_VOICE", "")
    if not model: return (None, "[tts piper: set PIPER_VOICE to a voice .onnx path]")
    out = _wav_tmp(b"")
    try:
        subprocess.run(["piper", "-m", model, "-f", out], input=text.encode(), check=True)
        return (open(out, "rb").read(), "audio/wav")
    finally:
        try: os.remove(out)
        except OSError: pass

# ── voice cloning ───────────────────────────────────────────────────────────────
def _reg_path(): return os.path.join(VOICES_DIR, "voices.json")

def list_voices():
    try:
        with open(_reg_path()) as f: return json.load(f)
    except Exception: return {}

def register_voice(name, ref_audio_bytes, engine="xtts"):
    """Store a reference clip -> a named cloned voice. ref_audio_bytes should be
    16kHz mono wav (run providers.normalize_audio first)."""
    os.makedirs(VOICES_DIR, exist_ok=True)
    ref = os.path.join(VOICES_DIR, f"{name}.wav")
    with open(ref, "wb") as f: f.write(ref_audio_bytes)
    reg = list_voices(); reg[name] = {"engine": engine, "ref": ref}
    with open(_reg_path(), "w") as f: json.dump(reg, f)
    return f"[voice '{name}' registered for {engine}]"

def delete_voice(name):
    """Remove a cloned voice from the registry and delete its reference clip."""
    reg = list_voices()
    if name not in reg:
        return f"[voice '{name}' not found]"
    ref = reg.pop(name).get("ref")
    with open(_reg_path(), "w") as f: json.dump(reg, f)
    if ref and os.path.exists(ref):
        try: os.remove(ref)
        except OSError: pass
    return f"[voice '{name}' deleted]"

def _tts_clone(text, voice, engine):
    reg = list_voices()
    if voice not in reg:
        return (None, f"[tts clone: no registered voice '{voice}' — /voice clone NAME first]")
    ref = reg[voice]["ref"]
    if engine == "xtts":
        if not _has("TTS"):
            return (None, "[tts xtts: not installed — pip install coqui-tts]")
        from TTS.api import TTS
        m = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        out = _wav_tmp(b"")
        try:
            m.tts_to_file(text=text, speaker_wav=ref, language="en", file_path=out)
            return (open(out, "rb").read(), "audio/wav")
        finally:
            try: os.remove(out)
            except OSError: pass
    if engine == "f5":
        if not _has("f5_tts"):
            return (None, "[tts f5: not installed — pip install f5-tts]")
        from f5_tts.api import F5TTS
        import io as _io, wave, numpy as np
        m = F5TTS()
        wav, sr, _ = m.infer(ref_file=ref, ref_text="", gen_text=text)
        samples = np.clip(np.array(wav).flatten(), -1, 1)
        buf = _io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
            w.writeframes((samples * 32767).astype("<i2").tobytes())
        return (buf.getvalue(), "audio/wav")
    return (None, f"[tts clone: engine '{engine}' not wired]")
