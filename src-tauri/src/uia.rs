//! Windows UI Automation helpers.
//!
//! Make-or-break spike for the "auto-learn dictionary from corrections" feature: can we
//! read the text of whatever control currently has focus — *including a terminal* (Windows
//! Terminal / conhost implement the UIA TextPattern provider)? If yes, the full feature
//! (remember inserted text → re-read later → diff → learn the correction) is buildable the
//! same way Wispr Flow / Willow do it. If a control exposes no TextPattern we still log its
//! name/class so we know what we're dealing with.

#![cfg(target_os = "windows")]

use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
};

/// Reads the text of the currently focused UI element via UI Automation.
/// Returns the text on success, or a diagnostic string (element name/class + reason) when
/// the element has no readable TextPattern. Must run on a thread that can initialize COM.
pub fn read_focused_text() -> Result<String, String> {
    unsafe {
        // Safe to call repeatedly; a different prior apartment just yields RPC_E_CHANGED_MODE,
        // which we ignore — UIA works regardless.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("CoCreateInstance(CUIAutomation): {e}"))?;

        let focused = automation
            .GetFocusedElement()
            .map_err(|e| format!("GetFocusedElement: {e}"))?;

        let name = focused
            .CurrentName()
            .map(|b| b.to_string())
            .unwrap_or_default();
        let class = focused
            .CurrentClassName()
            .map(|b| b.to_string())
            .unwrap_or_default();

        match focused.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) {
            Ok(text_pattern) => {
                let range = text_pattern
                    .DocumentRange()
                    .map_err(|e| format!("DocumentRange: {e}"))?;
                // -1 = entire document; we trim the preview when logging.
                let text = range
                    .GetText(-1)
                    .map_err(|e| format!("GetText: {e}"))?
                    .to_string();
                Ok(format!("name='{name}' class='{class}' :: {text}"))
            }
            Err(e) => Err(format!(
                "focused element has no TextPattern (name='{name}' class='{class}'): {e}"
            )),
        }
    }
}

/// Spike probe: read the focused element's text off-thread and log a short preview.
/// Wired to fire shortly after a paste so a normal dictation into a terminal reveals whether
/// UIA can see the terminal buffer. Remove once the real feature is built.
pub fn log_focused_text_spike() {
    std::thread::spawn(|| {
        // Let the paste land in the target control first.
        std::thread::sleep(std::time::Duration::from_millis(250));
        match read_focused_text() {
            Ok(text) => {
                let preview: String = text.chars().take(240).collect();
                log::info!(
                    "[uia-spike] OK ({} chars): {preview}",
                    text.chars().count()
                );
            }
            Err(e) => log::warn!("[uia-spike] {e}"),
        }
    });
}
