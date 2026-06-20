# Murmur

Free, local, privacy-first voice typing for Windows. Press a hotkey, speak, and your words appear as text in any app — WeChat, Feishu, your browser, the terminal, anywhere.

Everything runs on your own machine. Your voice never leaves your computer.

## Features

- **Works in any app** — a global hotkey types into whatever window has focus.
- **100% local and private** — speech-to-text runs on-device; nothing is uploaded.
- **Optional AI cleanup** — auto punctuation, filler-word removal, and dictionary-based correction, powered by a local model (Ollama) or your own API key.
- **Personal dictionary** — teach it your names, jargon, and homophone fixes; it can learn from your corrections.
- **Bilingual interface** — English and 简体中文, switchable at any time.
- **Hardware-aware** — detects your machine and recommends the best speech model for it.
- **Guided onboarding** — a hands-on tutorial gets you productive in about a minute.
- **Hands-free gesture mode** *(experimental)* — dictate with a webcam instead of a hotkey: raise a hand to start, raise it again to stop. See below.

## How it works

1. Hold your hotkey.
2. Speak naturally.
3. Release — the transcribed text is typed at your cursor.

An optional AI step can tidy up punctuation and remove the "ums" before the text lands.

## Hands-free gesture mode (experimental)

Control dictation with your webcam — no keyboard, no hotkey. The app uses on-device body-pose detection (MediaPipe) to watch for a simple gesture: **raise a hand to your head to toggle recording on and off**. Open palm or fist both work — only your wrist-to-head distance matters.

**Enable it**

1. Open **Settings → Experimental**.
2. Turn on **Gesture control**. The first time, it downloads a small (~6 MB) pose model — that's the one-time setup.
3. A new **Hands-free** tab then appears in the left sidebar. (The feature is off by default; the tab only shows once it's enabled.)

**Use it**

1. Open the **Hands-free** tab and **Allow** the camera when prompted. On Windows, also make sure *Settings → Privacy & security → Camera → Let desktop apps access your camera* is on.
2. **Raise a hand to your head once** → recording starts (the capsule overlay appears). You can lower your hand and keep talking.
3. **Raise your hand again** → recording stops and the text is typed into whatever app has focus.

The preview shows only a skeleton "stick figure" — never the camera image — and turns green while recording. Camera frames and detection stay entirely on your machine; nothing is uploaded or recorded. Use the **sensitivity** slider if it triggers too easily or misses.

## Install

Download the latest installer from the [Releases page](https://github.com/jinhanchen/Murmur/releases) and run it. The build is currently unsigned, so Windows may show an "unknown publisher" warning — click **More info**, then **Run anyway**.

Your settings, history, and downloaded models are stored locally under `%AppData%\com.murmur.app` and are kept across updates.

## Build from source

Requires [Bun](https://bun.sh), [Rust](https://rustup.rs), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
bun install
bun tauri dev      # run in development
bun tauri build    # produce an installer
```

## Tech

Tauri 2 · Rust · React + TypeScript. Speech recognition via whisper.cpp and ONNX Runtime; optional on-device LLM cleanup via Ollama.

## License

MIT — see [LICENSE](./LICENSE).
