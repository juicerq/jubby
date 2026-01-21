use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, WebviewWindow};

static WINDOW_VISIBLE: AtomicBool = AtomicBool::new(false);

fn focus_window(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn hyprland_show_window() {
    let _ = std::process::Command::new("hyprctl")
        .args(["dispatch", "focuswindow", "class:Jubby"])
        .status();
}

fn hyprland_hide_window() {
    let _ = std::process::Command::new("hyprctl")
        .args(["dispatch", "focuscurrentorlast"])
        .status();
}

fn hyprland_is_window_focused() -> bool {
    let output = std::process::Command::new("hyprctl")
        .args(["activewindow", "-j"])
        .output()
        .ok();
    
    if let Some(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Ok(window) = serde_json::from_str::<serde_json::Value>(&stdout) {
            return window.get("class").and_then(|c| c.as_str()) == Some("Jubby");
        }
    }
    false
}

pub fn toggle(app: &AppHandle) {
    if crate::core::hyprland::is_hyprland() {
        if hyprland_is_window_focused() {
            hyprland_hide_window();
        } else {
            hyprland_show_window();
        }
        return;
    }

    let is_visible = WINDOW_VISIBLE.load(Ordering::SeqCst);
    tracing::info!(target: "system", "toggle() called, current state: visible={}", is_visible);

    if let Some(window) = get_main_window(app) {
        if is_visible {
            tracing::info!(target: "system", "Window toggle: hiding");
            WINDOW_VISIBLE.store(false, Ordering::SeqCst);
            let _ = window.hide();
        } else {
            tracing::info!(target: "system", "Window toggle: showing");
            WINDOW_VISIBLE.store(true, Ordering::SeqCst);
            focus_window(&window);
        }
    } else {
        tracing::warn!(target: "system", "Window toggle: main window not found");
    }
}

pub fn show(app: &AppHandle) {
    if crate::core::hyprland::is_hyprland() {
        hyprland_show_window();
        return;
    }

    tracing::info!(target: "system", "show() called");
    WINDOW_VISIBLE.store(true, Ordering::SeqCst);
    if let Some(window) = get_main_window(app) {
        focus_window(&window);
    }
}

pub fn hide(app: &AppHandle) {
    if crate::core::hyprland::is_hyprland() {
        return;
    }

    WINDOW_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}
