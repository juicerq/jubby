//! Gerenciamento centralizado da janela principal.

use std::process::Command;
use tauri::{AppHandle, Manager, WebviewWindow};

/// Obtém a janela principal.
pub fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Foca a janela usando xdotool (X11).
/// Usa WM_CLASS para evitar conflitos com terminais que tenham "jubby" no título.
fn focus_with_xdotool() {
    // Busca pela classe da janela (mais confiável que título)
    let search_result = Command::new("xdotool")
        .args(["search", "--class", "jubby"])
        .output();

    match search_result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            eprintln!("[JUBBY] xdotool search --class jubby: {:?}", stdout.trim());

            // Pega o primeiro window ID
            if let Some(window_id) = stdout.lines().next() {
                let window_id = window_id.trim();
                if !window_id.is_empty() {
                    // windowactivate + windowraise para garantir foco
                    eprintln!("[JUBBY] xdotool windowactivate {}", window_id);
                    let _ = Command::new("xdotool")
                        .args(["windowactivate", window_id])
                        .output();
                    let _ = Command::new("xdotool")
                        .args(["windowraise", window_id])
                        .output();
                    eprintln!("[JUBBY] xdotool done");
                }
            }
        }
        Err(e) => {
            eprintln!("[JUBBY] xdotool não disponível: {}", e);
        }
    }
}

/// Toggle da janela via atalho global (Ctrl+1 no KDE).
/// Usa is_visible() para estado real em vez de tracking manual.
pub fn toggle_via_shortcut(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        // Consulta estado REAL da janela
        let is_visible = window.is_visible().unwrap_or(false);
        eprintln!("[JUBBY] toggle_via_shortcut: is_visible={}", is_visible);

        if is_visible {
            eprintln!("[JUBBY] -> hiding window");
            let hide_result = window.hide();
            eprintln!("[JUBBY] hide result: {:?}", hide_result);
        } else {
            eprintln!("[JUBBY] -> showing window");
            let show_result = window.show();
            eprintln!("[JUBBY] show result: {:?}", show_result);

            // Tauri set_focus (pode não funcionar em alguns WMs)
            let focus_result = window.set_focus();
            eprintln!("[JUBBY] set_focus result: {:?}", focus_result);

            // xdotool como reforço (funciona em X11/XWayland)
            focus_with_xdotool();
        }
    } else {
        eprintln!("[JUBBY] ERRO: janela principal não encontrada!");
    }
}

/// Mostra janela e foca (via menu da tray).
pub fn show(app: &AppHandle) {
    if let Some(window) = get_main_window(app) {
        let _ = window.show();
        let _ = window.set_focus();
        focus_with_xdotool();
    }
}
