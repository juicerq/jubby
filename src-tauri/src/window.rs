use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};

const SHORTCUT_BLUR_COOLDOWN_MS: u64 = 150;
static LAST_SHORTCUT_ACTION: AtomicU64 = AtomicU64::new(0);

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn is_within_shortcut_cooldown() -> bool {
    let last = LAST_SHORTCUT_ACTION.load(Ordering::SeqCst);
    current_time_ms().saturating_sub(last) < SHORTCUT_BLUR_COOLDOWN_MS
}

fn mark_shortcut_action() {
    LAST_SHORTCUT_ACTION.store(current_time_ms(), Ordering::SeqCst);
}

fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn toggle(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        mark_shortcut_action();
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub fn show(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide_on_blur(app: &AppHandle) {
    if is_within_shortcut_cooldown() {
        return;
    }
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}
