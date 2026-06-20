//! Windows low-level keyboard hook implementation

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, MsgWaitForMultipleObjects, PeekMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, LLKHF_EXTENDED, MSG, MSLLHOOKSTRUCT,
    PM_REMOVE, QS_ALLINPUT, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN,
    WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP,
    WM_SYSKEYDOWN, WM_SYSKEYUP, WM_XBUTTONDOWN, WM_XBUTTONUP,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VIRTUAL_KEY,
};

use crate::error::Result;
use crate::platform::state::BlockingHotkeys;
use crate::types::{Hotkey, Key, KeyEvent, Modifiers};

use super::keycode::{vk_to_key, vk_to_modifier};

const HOOK_LOOP_TIMEOUT_MS: u32 = 10;

/// Tag placed on our injected mask-key events so the hook ignores its own injection.
const MASK_EXTRA_INFO: usize = 0x0044_414E; // "DAN"
/// Unassigned virtual-key used purely to mask the Start menu (PowerToys uses 0xFF too).
const DUMMY_VK: u16 = 0xFF;

/// Inject a phantom key to suppress the Windows Start menu for Win-based shortcuts.
///
/// Sent the instant a Win combo completes — while Win is still held — so the
/// eventual Win key-up is never a "clean" lone press and the Start menu stays
/// closed. Tagged with `MASK_EXTRA_INFO` so `keyboard_hook_proc` skips it.
/// Mirrors the PowerToys / AutoHotkey Win-remap masking technique.
fn inject_mask_key() {
    let make = |flags: KEYBD_EVENT_FLAGS| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(DUMMY_VK),
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: MASK_EXTRA_INFO,
            },
        },
    };
    let inputs = [make(KEYBD_EVENT_FLAGS(0)), make(KEYEVENTF_KEYUP)];
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

/// Thread-local state for the keyboard hook callback.
///
/// Windows low-level hooks require a callback function with a specific signature,
/// so we use thread-local storage to access our state from within the callback.
struct HookContext {
    event_sender: Sender<KeyEvent>,
    current_modifiers: Modifiers,
    blocking_hotkeys: Option<BlockingHotkeys>,
}

thread_local! {
    static HOOK_CONTEXT: std::cell::RefCell<Option<HookContext>> = const { std::cell::RefCell::new(None) };
}

/// Drain all pending thread messages and return `true` if WM_QUIT was received.
fn drain_thread_messages(msg: &mut MSG) -> bool {
    unsafe {
        while PeekMessageW(msg, None, 0, 0, PM_REMOVE).as_bool() {
            if msg.message == WM_QUIT {
                return true;
            }
            let _ = TranslateMessage(msg);
            DispatchMessageW(msg);
        }
    }
    false
}

/// Wait for new input/messages or until timeout expires.
fn wait_for_message_or_timeout(timeout_ms: u32) {
    unsafe {
        let _ = MsgWaitForMultipleObjects(None, false, timeout_ms, QS_ALLINPUT);
    }
}

/// Internal listener state returned to KeyboardListener
pub(crate) struct WindowsListenerState {
    pub event_receiver: mpsc::Receiver<KeyEvent>,
    pub thread_handle: Option<JoinHandle<()>>,
    pub running: Arc<AtomicBool>,
    pub blocking_hotkeys: Option<BlockingHotkeys>,
}

/// Spawn a Windows low-level keyboard hook listener
pub(crate) fn spawn(blocking_hotkeys: Option<BlockingHotkeys>) -> Result<WindowsListenerState> {
    let (tx, rx) = mpsc::channel();
    let running = Arc::new(AtomicBool::new(true));
    let thread_running = Arc::clone(&running);
    let thread_blocking = blocking_hotkeys.clone();

    let handle = thread::spawn(move || {
        // Initialize thread-local hook context
        HOOK_CONTEXT.with(|ctx| {
            *ctx.borrow_mut() = Some(HookContext {
                event_sender: tx,
                current_modifiers: Modifiers::empty(),
                blocking_hotkeys: thread_blocking,
            });
        });

        // Install the low-level keyboard hook
        let kb_hook =
            unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook_proc), None, 0) };

        let kb_hook = match kb_hook {
            Ok(h) => h,
            Err(e) => {
                eprintln!("Failed to install keyboard hook: {:?}", e);
                return;
            }
        };

        // Install the low-level mouse hook
        let mouse_hook = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), None, 0) };

        let mouse_hook = match mouse_hook {
            Ok(h) => h,
            Err(e) => {
                eprintln!("Failed to install mouse hook: {:?}", e);
                // Clean up keyboard hook before returning
                unsafe {
                    let _ = UnhookWindowsHookEx(kb_hook);
                }
                return;
            }
        };

        // Message loop - required for low-level hooks to function.
        // Keep the short timeout so shutdown polling behavior remains unchanged.
        let mut msg = MSG::default();
        loop {
            // Check if we should stop
            if !thread_running.load(Ordering::SeqCst) {
                break;
            }

            // Process all pending messages
            if drain_thread_messages(&mut msg) {
                break;
            }

            // Wait for messages or timeout — unlike thread::sleep, this returns
            // immediately when a message arrives, so hook callbacks are never delayed.
            wait_for_message_or_timeout(HOOK_LOOP_TIMEOUT_MS);
        }

        // Clean up the hooks
        unsafe {
            let _ = UnhookWindowsHookEx(kb_hook);
            let _ = UnhookWindowsHookEx(mouse_hook);
        }

        // Clear thread-local state
        HOOK_CONTEXT.with(|ctx| {
            *ctx.borrow_mut() = None;
        });
    });

    Ok(WindowsListenerState {
        event_receiver: rx,
        thread_handle: Some(handle),
        running,
        blocking_hotkeys,
    })
}

/// Low-level keyboard hook callback
///
/// This function is called by Windows for every keyboard event system-wide.
/// It must return quickly to avoid input lag.
unsafe extern "system" fn keyboard_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // If code < 0, we must pass to next hook without processing
    if code < 0 {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    // Ignore our own injected mask key (Start-menu suppression) — never process,
    // emit, or block it, or we'd recurse on our own SendInput.
    {
        let kb_struct = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        if kb_struct.dwExtraInfo == MASK_EXTRA_INFO {
            return CallNextHookEx(None, code, wparam, lparam);
        }
    }

    let mut should_block = false;
    let mut should_mask = false;

    // Process the keyboard event
    HOOK_CONTEXT.with(|ctx_cell| {
        let mut ctx_ref = ctx_cell.borrow_mut();
        if let Some(ctx) = ctx_ref.as_mut() {
            // Extract key information from KBDLLHOOKSTRUCT
            let kb_struct = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            let vk_code = kb_struct.vkCode as u16;
            let is_extended = (kb_struct.flags.0 & LLKHF_EXTENDED.0) != 0;

            let is_key_down = matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);

            // Check if this is a modifier key
            if let Some(modifier) = vk_to_modifier(vk_code) {
                let prev_modifiers = ctx.current_modifiers;

                // Update modifier state
                if is_key_down {
                    ctx.current_modifiers |= modifier;
                } else {
                    ctx.current_modifiers &= !modifier;
                }

                // Only emit event if modifiers actually changed
                if ctx.current_modifiers != prev_modifiers {
                    let combo_now =
                        should_block_hotkey(&ctx.blocking_hotkeys, ctx.current_modifiers, None);
                    let combo_prev =
                        should_block_hotkey(&ctx.blocking_hotkeys, prev_modifiers, None);

                    // Win-based modifier hotkey (e.g. Ctrl+Win): suppress the Start
                    // menu *without* blocking the keys. Blocking the Win key-up would
                    // leave the OS thinking Win is stuck whenever Win was pressed
                    // before Ctrl. Instead, the moment the combo completes — while Win
                    // is still held — inject a phantom key so the eventual Win release
                    // is never "clean", and the Start menu never opens.
                    let involves_super =
                        (ctx.current_modifiers | prev_modifiers).intersects(Modifiers::CMD);

                    if combo_now
                        && !combo_prev
                        && ctx.current_modifiers.intersects(Modifiers::CMD)
                    {
                        // Defer the mask injection until AFTER the HOOK_CONTEXT borrow is
                        // released. Calling SendInput here re-enters the hook on our own
                        // injected event; a nested borrow_mut() would then double-borrow
                        // the RefCell and panic — which aborts the whole process at the
                        // extern "system" FFI boundary. Dispatched after the closure.
                        should_mask = true;
                    }

                    should_block = if involves_super {
                        // Masked above — let the keys pass so nothing gets stuck.
                        false
                    } else {
                        combo_now || combo_prev
                    };

                    let _ = ctx.event_sender.send(KeyEvent {
                        modifiers: ctx.current_modifiers,
                        key: None,
                        is_key_down,
                        changed_modifier: Some(modifier),
                    });
                }
            } else if let Some(key) = vk_to_key(vk_code, is_extended) {
                // Regular key event
                should_block =
                    should_block_hotkey(&ctx.blocking_hotkeys, ctx.current_modifiers, Some(key));

                let _ = ctx.event_sender.send(KeyEvent {
                    modifiers: ctx.current_modifiers,
                    key: Some(key),
                    is_key_down,
                    changed_modifier: None,
                });
            }
        }
    });

    // Inject the Start-menu mask key off the hook thread. Doing SendInput inline can
    // make this low-level hook exceed LowLevelHooksTimeout; Windows then silently
    // drops subsequent key events, desyncing our modifier tracking so a later
    // Ctrl+Win press is missed entirely (capsule never appears). A detached thread
    // keeps the callback fast; the phantom still lands while Win is held (~ms vs the
    // ~100ms+ a human holds the combo). The borrow is already released, so the
    // re-entrant hook call on our own injected key still can't double-borrow.
    if should_mask {
        std::thread::spawn(inject_mask_key);
    }

    if should_block {
        // Return non-zero to block the event from propagating
        LRESULT(1)
    } else {
        // Pass to next hook in chain
        CallNextHookEx(None, code, wparam, lparam)
    }
}

/// Low-level mouse hook callback
///
/// This function is called by Windows for every mouse event system-wide.
unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // If code < 0, we must pass to next hook without processing
    if code < 0 {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    // Process the mouse event
    HOOK_CONTEXT.with(|ctx_cell| {
        let mut ctx_ref = ctx_cell.borrow_mut();
        if let Some(ctx) = ctx_ref.as_mut() {
            let mouse_struct = &*(lparam.0 as *const MSLLHOOKSTRUCT);

            // Only report left/right clicks when modifiers are held (to avoid noise)
            let has_modifiers = !ctx.current_modifiers.is_empty();

            let (key, is_down) = match wparam.0 as u32 {
                WM_LBUTTONDOWN if has_modifiers => (Some(Key::MouseLeft), true),
                WM_LBUTTONUP if has_modifiers => (Some(Key::MouseLeft), false),
                WM_RBUTTONDOWN if has_modifiers => (Some(Key::MouseRight), true),
                WM_RBUTTONUP if has_modifiers => (Some(Key::MouseRight), false),
                // Middle and X buttons always reported
                WM_MBUTTONDOWN => (Some(Key::MouseMiddle), true),
                WM_MBUTTONUP => (Some(Key::MouseMiddle), false),
                WM_XBUTTONDOWN => {
                    // High word of mouseData contains which X button (1 or 2)
                    let xbutton = (mouse_struct.mouseData >> 16) & 0xFFFF;
                    let key = if xbutton == 1 {
                        Some(Key::MouseX1)
                    } else if xbutton == 2 {
                        Some(Key::MouseX2)
                    } else {
                        None
                    };
                    (key, true)
                }
                WM_XBUTTONUP => {
                    let xbutton = (mouse_struct.mouseData >> 16) & 0xFFFF;
                    let key = if xbutton == 1 {
                        Some(Key::MouseX1)
                    } else if xbutton == 2 {
                        Some(Key::MouseX2)
                    } else {
                        None
                    };
                    (key, false)
                }
                _ => (None, false),
            };

            if let Some(key) = key {
                let _ = ctx.event_sender.send(KeyEvent {
                    modifiers: ctx.current_modifiers,
                    key: Some(key),
                    is_key_down: is_down,
                    changed_modifier: None,
                });
            }
        }
    });

    // Always pass mouse events through (no blocking for mouse)
    CallNextHookEx(None, code, wparam, lparam)
}

/// Check if a hotkey combination should be blocked
fn should_block_hotkey(
    blocking_hotkeys: &Option<BlockingHotkeys>,
    modifiers: Modifiers,
    key: Option<Key>,
) -> bool {
    if let Some(ref hotkeys) = blocking_hotkeys {
        if let Ok(set) = hotkeys.lock() {
            return set
                .iter()
                .any(|h| h.modifiers.matches(modifiers) && h.key == key);
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};
    use windows::Win32::UI::WindowsAndMessaging::PostQuitMessage;

    fn clear_message_queue() {
        let mut msg = MSG::default();
        unsafe { while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {} }
    }

    #[test]
    fn wait_times_out_when_no_messages() {
        clear_message_queue();
        let start = Instant::now();
        wait_for_message_or_timeout(20);
        let elapsed = start.elapsed();
        assert!(
            elapsed >= Duration::from_millis(8),
            "expected wait to block close to timeout, elapsed={elapsed:?}"
        );
        clear_message_queue();
    }

    #[test]
    fn wait_returns_immediately_when_message_is_pending() {
        clear_message_queue();
        unsafe {
            PostQuitMessage(0);
        }
        let start = Instant::now();
        wait_for_message_or_timeout(200);
        let elapsed = start.elapsed();
        assert!(
            elapsed < Duration::from_millis(100),
            "expected pending message to wake wait early, elapsed={elapsed:?}"
        );
        clear_message_queue();
    }

    #[test]
    fn drain_messages_stops_on_wm_quit() {
        clear_message_queue();
        unsafe {
            PostQuitMessage(0);
        }
        let mut msg = MSG::default();
        assert!(drain_thread_messages(&mut msg));
        clear_message_queue();
    }
}
