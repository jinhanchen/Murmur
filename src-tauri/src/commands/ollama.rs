// Ollama 本地大模型集成：检测、列举、拉取（带流式进度）。
// 走 Rust 端 reqwest（server-to-server，绕开 WebView 的 CORS 限制）。
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};

const OLLAMA_BASE: &str = "http://localhost:11434";

#[derive(Debug, Clone, Serialize, Type)]
pub struct OllamaStatus {
    pub running: bool,
    /// OpenAI 兼容端点，可直接配进「custom」provider。
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OllamaPullProgress {
    pub model: String,
    pub status: String,
    pub completed: u64,
    pub total: u64,
    pub percentage: f64,
    pub done: bool,
    pub error: Option<String>,
}

/// 检测 Ollama 是否在运行（GET /api/version）。
#[tauri::command]
#[specta::specta]
pub async fn ollama_status() -> Result<OllamaStatus, String> {
    let client = reqwest::Client::new();
    let running = client
        .get(format!("{}/api/version", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    Ok(OllamaStatus {
        running,
        base_url: format!("{}/v1", OLLAMA_BASE),
    })
}

/// 列出已安装的本地模型名（GET /api/tags）。
#[tauri::command]
#[specta::specta]
pub async fn ollama_list_models() -> Result<Vec<String>, String> {
    #[derive(Deserialize)]
    struct Tag {
        name: String,
    }
    #[derive(Deserialize)]
    struct TagsResp {
        models: Vec<Tag>,
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("无法连接 Ollama：{e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama 返回 HTTP {}", resp.status()));
    }

    let tags: TagsResp = resp
        .json()
        .await
        .map_err(|e| format!("解析 Ollama 模型列表失败：{e}"))?;

    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

/// 拉取一个本地模型（POST /api/pull，流式 NDJSON）。
/// 进度通过 `ollama-pull-progress` 事件实时上报给前端。
#[tauri::command]
#[specta::specta]
pub async fn ollama_pull_model(app: AppHandle, model: String) -> Result<(), String> {
    #[derive(Deserialize)]
    struct PullLine {
        status: Option<String>,
        total: Option<u64>,
        completed: Option<u64>,
        error: Option<String>,
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/api/pull", OLLAMA_BASE))
        // 同时带 name + model 以兼容新旧 Ollama 版本。
        .json(&serde_json::json!({ "name": model, "model": model, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("无法连接 Ollama：{e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama 下载失败：HTTP {}", resp.status()));
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    let mut last_emit = std::time::Instant::now();
    let throttle = std::time::Duration::from_millis(120);

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载中断：{e}"))?;
        buf.extend_from_slice(&chunk);

        // NDJSON：按换行切出完整的一行再解析（一行可能跨多个 chunk）。
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let line = &line[..line.len().saturating_sub(1)];
            if line.is_empty() {
                continue;
            }

            let parsed: PullLine = match serde_json::from_slice(line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if let Some(err) = parsed.error {
                let _ = app.emit(
                    "ollama-pull-progress",
                    &OllamaPullProgress {
                        model: model.clone(),
                        status: "error".to_string(),
                        completed: 0,
                        total: 0,
                        percentage: 0.0,
                        done: true,
                        error: Some(err.clone()),
                    },
                );
                return Err(err);
            }

            let total = parsed.total.unwrap_or(0);
            let completed = parsed.completed.unwrap_or(0);
            let percentage = if total > 0 {
                (completed as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            let status = parsed.status.unwrap_or_default();
            let done = status == "success";

            if done || last_emit.elapsed() >= throttle {
                let _ = app.emit(
                    "ollama-pull-progress",
                    &OllamaPullProgress {
                        model: model.clone(),
                        status: status.clone(),
                        completed,
                        total,
                        percentage,
                        done,
                        error: None,
                    },
                );
                last_emit = std::time::Instant::now();
            }
        }
    }

    // 收尾：确保前端收到 100% / done。
    let _ = app.emit(
        "ollama-pull-progress",
        &OllamaPullProgress {
            model: model.clone(),
            status: "success".to_string(),
            completed: 0,
            total: 0,
            percentage: 100.0,
            done: true,
            error: None,
        },
    );

    Ok(())
}
