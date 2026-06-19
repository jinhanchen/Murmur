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

## How it works

1. Hold your hotkey.
2. Speak naturally.
3. Release — the transcribed text is typed at your cursor.

An optional AI step can tidy up punctuation and remove the "ums" before the text lands.

## Install

Download the latest installer from the [Releases page](https://github.com/jinhanchen/Murmur/releases) and run it. The build is currently unsigned, so Windows may show an "unknown publisher" warning — click **More info**, then **Run anyway**.

Your settings, history, and downloaded models are stored locally under `%AppData%\com.pais.handy` and are kept across updates.

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
