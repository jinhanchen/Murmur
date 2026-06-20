use std::path::{Path, PathBuf};
use std::sync::{Once, OnceLock};
use tauri::Manager;

/// Portable mode support for Murmur.
///
/// When a file named `portable` exists next to the executable, all user data
/// (settings, models, recordings, database, logs) is stored in a `Data/`
/// directory alongside the executable instead of `%APPDATA%`.

static PORTABLE_DATA_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

/// The legacy bundle identifier used before the Handy -> Murmur rename. The new
/// identifier (`com.murmur.app`) moves the OS app-data dir, so on first launch
/// we copy the old dir's contents over to avoid users appearing to lose all
/// their data (settings, models, history, recordings, logs).
const LEGACY_IDENTIFIER: &str = "com.pais.handy";

/// The current bundle identifier (must match `identifier` in tauri.conf.json).
/// Used to resolve the new app-data dir WITHOUT an `AppHandle`, so the legacy
/// data migration can run eagerly at startup before the log plugin / settings
/// store write their own files into the new dir (which would otherwise make the
/// dir look non-empty and suppress the migration).
const NEW_IDENTIFIER: &str = "com.murmur.app";

/// Sentinel file written into the new app-data dir after a successful (or
/// best-effort) legacy migration. Its presence means "we already attempted the
/// one-time copy" — used as the idempotency guard instead of "is the new dir
/// empty?", because the log/store plugins populate the new dir during the very
/// same startup, before the first `app_data_dir()` call.
const MIGRATION_MARKER: &str = ".migrated_from_com.pais.handy";

/// Detect portable mode by looking for a `portable` marker file next to the exe.
/// Must be called once at startup before Tauri initializes.
pub fn init() {
    PORTABLE_DATA_DIR.get_or_init(|| {
        let exe_path = std::env::current_exe().ok()?;
        let exe_dir = exe_path.parent()?;

        let marker_path = exe_dir.join("portable");
        let data_dir = exe_dir.join("Data");

        let is_portable = if is_valid_portable_marker(&marker_path) {
            true
        } else if marker_path.exists() && data_dir.exists() {
            // Migration: v0.8.0 created an empty marker file. If we find an
            // empty/invalid marker alongside an existing Data/ dir, this is a
            // real portable install — upgrade the marker in place.
            eprintln!("[portable] upgrading legacy empty marker to magic string");
            let _ = std::fs::write(&marker_path, "Murmur Portable Mode");
            true
        } else {
            false
        };

        if is_portable {
            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir).ok()?;
            }
            eprintln!("[portable] data dir: {}", data_dir.display());
            Some(data_dir)
        } else {
            None
        }
    });
}

/// Returns `true` if running in portable mode.
pub fn is_portable() -> bool {
    PORTABLE_DATA_DIR.get().and_then(|v| v.as_ref()).is_some()
}

/// Get the portable data dir (if active). Does not require an AppHandle.
/// Returns `None` when not in portable mode.
pub fn data_dir() -> Option<&'static PathBuf> {
    PORTABLE_DATA_DIR.get().and_then(|v| v.as_ref())
}

/// Portable-aware replacement for `app.path().app_data_dir()`.
pub fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(dir) = data_dir() {
        Ok(dir.clone())
    } else {
        let new_dir = app.path().app_data_dir()?;
        // One-time, idempotent, safe copy of legacy (com.pais.handy) app data
        // into the new (com.murmur.app) dir. Never moves/deletes the old data.
        migrate_legacy_app_data(&new_dir);
        Ok(new_dir)
    }
}

/// Eagerly run the one-time legacy data migration WITHOUT an `AppHandle`.
///
/// Call this once at the very start of `run()` — immediately after
/// [`init()`] and BEFORE the tauri-plugin-log target and the settings store
/// are registered. Those plugins write `logs/murmur.log` and
/// `settings_store.json` into the new app-data dir during `setup()`, *before*
/// the first `crate::portable::app_data_dir()` call. If the migration were only
/// triggered from `app_data_dir()` and gated on "is the new dir empty?", it
/// would always find those freshly-written files and skip the copy — silently
/// losing the user's old `com.pais.handy` data on the real upgrade path.
///
/// In portable mode there is nothing to migrate (data lives next to the exe),
/// so this is a no-op.
pub fn migrate_legacy_app_data_eager() {
    // Portable installs never touch %APPDATA%, so skip entirely.
    if is_portable() {
        return;
    }

    // Resolve the new dir exactly the way Tauri does:
    //   app_data_dir() == dirs::data_dir().join(<identifier>)
    // (Windows: %APPDATA% Roaming, macOS: Application Support, Linux: XDG data.)
    let Some(base) = dirs::data_dir() else {
        log::warn!("[migration] could not resolve user data dir; skipping legacy migration");
        return;
    };
    let new_dir = base.join(NEW_IDENTIFIER);
    migrate_legacy_app_data(&new_dir);
}

/// One-time migration of legacy app data from the old identifier dir to the new
/// one. Runs at most once per process (guarded by `Once`).
///
/// Idempotency is gated on a dedicated sentinel file ([`MIGRATION_MARKER`])
/// written after a successful copy — NOT on "is the new dir empty?", because the
/// log/store plugins populate the new dir during startup before this ever runs.
/// In addition, a copy is only attempted when the new dir does not already hold
/// *real* user data (`history.db` or a `models/` dir) so a genuine fresh install
/// of the new identifier is never disturbed.
///
/// COPIES recursively — it never moves or deletes the old data — tolerates large
/// model files and per-file IO errors (logs and continues), and never panics.
fn migrate_legacy_app_data(new_dir: &Path) {
    static MIGRATION: Once = Once::new();
    MIGRATION.call_once(|| {
        // 1. Idempotency guard: if we already ran the one-time copy (marker
        //    present), there is nothing to do — even on a resumed/second launch.
        let marker = new_dir.join(MIGRATION_MARKER);
        if marker.exists() {
            return;
        }

        // 2. If the new dir already holds REAL user data, treat it as an
        //    established install and do not migrate. We look for actual data
        //    files (history.db / models dir) rather than ANY entry, so the
        //    logs/ + settings_store.json that the plugins write during this very
        //    startup do NOT suppress the copy.
        if new_dir.join("history.db").exists() || new_dir.join("models").is_dir() {
            // Established new install — leave a marker so we never re-check.
            write_migration_marker(&marker);
            return;
        }

        // 3. Derive the OLD dir as a sibling of the new dir. On every OS Tauri
        //    places both identifiers under the same base (Windows Roaming,
        //    macOS Application Support, Linux $XDG_DATA_HOME), so swapping the
        //    last path component is correct and avoids hardcoding the base.
        let old_dir = match new_dir.parent() {
            Some(parent) => parent.join(LEGACY_IDENTIFIER),
            None => return,
        };

        // 4. Old must exist and be non-empty, else there is nothing to migrate.
        let old_has_data = std::fs::read_dir(&old_dir)
            .map(|mut it| it.next().is_some())
            .unwrap_or(false);
        if !old_has_data {
            // Nothing to copy; mark done so we don't probe the old dir again.
            write_migration_marker(&marker);
            return;
        }

        log::info!(
            "[migration] copying legacy app data {} -> {}",
            old_dir.display(),
            new_dir.display()
        );

        if let Err(e) = std::fs::create_dir_all(new_dir) {
            log::error!("[migration] failed to create new app data dir: {e}");
            return;
        }

        match copy_dir_recursive(&old_dir, new_dir) {
            Ok(()) => {
                log::info!("[migration] legacy app data copy complete");
                // Only write the marker on a clean copy so a run interrupted by
                // a hard crash mid-copy can resume on the next launch.
                write_migration_marker(&marker);
            }
            Err(e) => log::error!(
                "[migration] copy encountered errors (continuing, old data preserved): {e}"
            ),
        }
    });
}

/// Best-effort write of the migration sentinel. Failure is logged, never fatal —
/// if we can't write it, the worst case is we re-probe (and skip via the
/// data-file check / skip-if-exists copy) on the next launch.
fn write_migration_marker(marker: &Path) {
    if let Err(e) = std::fs::write(marker, b"") {
        log::warn!(
            "[migration] failed to write migration marker {}: {e}",
            marker.display()
        );
    }
}

/// Recursively copy `src` into `dst`. Tolerates per-entry IO errors by logging
/// and continuing (a single locked/in-use file — e.g. an open history.db WAL or
/// a model mid-download — must not abort the whole migration). Streams large
/// files via `std::fs::copy` (OS-level copy, fine for the multi-GB models).
/// Skips files that already exist in `dst` so an interrupted prior run can be
/// resumed without truncating already-copied data.
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    let entries = std::fs::read_dir(src)?;
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                log::warn!("[migration] skipping unreadable entry in {}: {e}", src.display());
                continue;
            }
        };
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(e) => {
                log::warn!("[migration] skipping {} (file_type error): {e}", from.display());
                continue;
            }
        };

        if file_type.is_dir() {
            if let Err(e) = std::fs::create_dir_all(&to) {
                log::warn!("[migration] failed to create dir {}: {e}", to.display());
                continue;
            }
            if let Err(e) = copy_dir_recursive(&from, &to) {
                log::warn!("[migration] error copying subdir {}: {e}", from.display());
            }
        } else if file_type.is_file() {
            // Skip if already present (resume an interrupted prior copy).
            if to.exists() {
                continue;
            }
            if let Err(e) = std::fs::copy(&from, &to) {
                log::warn!(
                    "[migration] failed to copy {} -> {}: {e}",
                    from.display(),
                    to.display()
                );
            }
        }
        // Symlinks and other special files are intentionally skipped.
    }
    Ok(())
}

/// Portable-aware replacement for `app.path().app_log_dir()`.
pub fn app_log_dir(app: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(dir) = data_dir() {
        Ok(dir.join("logs"))
    } else {
        app.path().app_log_dir()
    }
}

/// Resolve a relative path against the app data directory (portable-aware).
/// Replaces `app.path().resolve(path, BaseDirectory::AppData)`.
pub fn resolve_app_data(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, tauri::Error> {
    Ok(app_data_dir(app)?.join(relative))
}

/// Get the path to use with `tauri-plugin-store`.
/// Returns an absolute path in portable mode (so the store plugin writes to
/// the portable Data dir) or the original relative path otherwise.
pub fn store_path(relative: &str) -> PathBuf {
    if let Some(dir) = data_dir() {
        dir.join(relative)
    } else {
        PathBuf::from(relative)
    }
}

/// Check if a marker file path contains the portable magic string.
/// Extracted for testability.
fn is_valid_portable_marker(path: &std::path::Path) -> bool {
    std::fs::read_to_string(path)
        .map(|s| s.trim().starts_with("Murmur Portable Mode"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_valid_magic_string_enables_portable() {
        let dir = std::env::temp_dir().join("murmur_test_valid");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "Murmur Portable Mode").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_empty_file_does_not_enable_portable() {
        let dir = std::env::temp_dir().join("murmur_test_empty");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        std::fs::File::create(&marker).unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_wrong_content_does_not_enable_portable() {
        let dir = std::env::temp_dir().join("murmur_test_wrong");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "some other content").unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_missing_file_does_not_enable_portable() {
        let path = std::path::Path::new("/nonexistent/portable");
        assert!(!is_valid_portable_marker(path));
    }

    #[test]
    fn test_legacy_empty_marker_without_data_dir_does_not_enable_portable() {
        // Empty marker alone (scoop scenario) — no Data/ dir → not portable
        let dir = std::env::temp_dir().join("murmur_test_legacy_no_data");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        std::fs::File::create(&marker).unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_magic_string_with_whitespace_enables_portable() {
        let dir = std::env::temp_dir().join("murmur_test_ws");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "  Murmur Portable Mode\n").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
