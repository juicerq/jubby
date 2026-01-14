use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};

const BLUR_COOLDOWN_MS: u64 = 1500;
static LAST_WINDOW_SHOW: AtomicU64 = AtomicU64::new(0);
static WINDOW_VISIBLE: AtomicBool = AtomicBool::new(false);

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn mark_window_shown() {
    LAST_WINDOW_SHOW.store(current_time_ms(), Ordering::SeqCst);
}

fn is_recently_shown() -> bool {
    let last = LAST_WINDOW_SHOW.load(Ordering::SeqCst);
    let elapsed = current_time_ms().saturating_sub(last);
    elapsed < BLUR_COOLDOWN_MS
}

fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn toggle(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        let is_visible = WINDOW_VISIBLE.load(Ordering::SeqCst);

        if is_visible {
            WINDOW_VISIBLE.store(false, Ordering::SeqCst);
            let _ = window.hide();
        } else {
            WINDOW_VISIBLE.store(true, Ordering::SeqCst);
            mark_window_shown();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub fn show(app: &AppHandle) {
    WINDOW_VISIBLE.store(true, Ordering::SeqCst);
    mark_window_shown();
    if let Some(window) = get_main_window(app) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide_on_blur(app: &AppHandle) {
    if is_recently_shown() {
        return;
    }
    WINDOW_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}

pub fn hide(app: &AppHandle) {
    WINDOW_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}
