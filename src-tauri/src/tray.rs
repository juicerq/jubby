use tauri::{
    image::Image,
    tray::{TrayIcon, TrayIconBuilder},
    App, Manager, RunEvent, WindowEvent,
};

pub fn setup_tray(app: &App) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    // Use the default window icon from tauri.conf.json bundle
    let icon = app.default_window_icon()
        .cloned()
        .unwrap_or_else(|| {
            // Fallback: load embedded PNG icon
            Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("Failed to load embedded icon")
        });

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Jubby")
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(tray)
}

pub fn handle_run_event(app_handle: &tauri::AppHandle, event: RunEvent) {
    if let RunEvent::WindowEvent {
        label,
        event: WindowEvent::CloseRequested { api, .. },
        ..
    } = event
    {
        if label == "main" {
            // Prevent the window from closing, just hide it
            api.prevent_close();
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.hide();
            }
        }
    }
}
