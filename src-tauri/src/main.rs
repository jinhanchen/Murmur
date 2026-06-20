// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use murmur_lib::CliArgs;

fn main() {
    let cli_args = CliArgs::parse();

    #[cfg(target_os = "linux")]
    {
        // DMABUF renderer causes crashes on various GPU/display server configurations
        // See: https://github.com/tauri-apps/tauri/issues/9394
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // Note: the WebView2 occlusion fix is NOT set here via WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
    // because wry always sets AdditionalBrowserArguments explicitly, which makes WebView2
    // ignore that env var. It's set via the window builders' additional_browser_args instead
    // (see lib.rs main window + overlay.rs).

    murmur_lib::run(cli_args)
}
