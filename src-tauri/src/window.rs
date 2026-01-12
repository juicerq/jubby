//! Gerenciamento centralizado da janela principal.
//!
//! Centraliza todas as operações de visibilidade para evitar race conditions
//! entre o atalho global Alt+Q e eventos de foco.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};

/// Tempo em ms para ignorar blur após ação do atalho.
/// Necessário porque atalhos globais no Linux podem causar
/// perda de foco momentânea antes do handler executar.
const SHORTCUT_BLUR_COOLDOWN_MS: u64 = 150;

/// Timestamp da última ação via atalho global.
static LAST_SHORTCUT_ACTION: AtomicU64 = AtomicU64::new(0);

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn is_within_shortcut_cooldown() -> bool {
    let last = LAST_SHORTCUT_ACTION.load(Ordering::SeqCst);
    let now = current_time_ms();
    now.saturating_sub(last) < SHORTCUT_BLUR_COOLDOWN_MS
}

fn mark_shortcut_action() {
    LAST_SHORTCUT_ACTION.store(current_time_ms(), Ordering::SeqCst);
}

/// Obtém a janela principal.
pub fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Toggle da janela via atalho global (Alt+Q).
/// Marca timestamp para evitar race condition com blur.
pub fn toggle_via_shortcut(app: &AppHandle) {
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

/// Mostra janela (via menu da tray ou outro).
pub fn show(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Esconde janela por perda de foco.
/// Ignora se dentro do cooldown de atalho.
pub fn hide_on_blur(app: &AppHandle) {
    if is_within_shortcut_cooldown() {
        return; // Ignorar blur causado pelo processamento do atalho
    }

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
