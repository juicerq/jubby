//! Gerenciamento centralizado da janela principal.

use tauri::{AppHandle, Manager, WebviewWindow};

/// Obtém a janela principal.
pub fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Mostra janela e foca (via menu da tray).
pub fn show(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Esconde janela por perda de foco.
pub fn hide_on_blur(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}

/// Esconde janela (chamada explícita).
pub fn hide(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}
