use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    App, Manager, RunEvent, WindowEvent,
};

pub fn setup_tray(app: &App) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    println!("[Jubby] Setting up tray icon...");

    // Use the default window icon from tauri.conf.json bundle
    let icon = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| {
            println!("[Jubby] Using fallback embedded icon");
            // Fallback: load embedded PNG icon
            Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("Failed to load embedded icon")
        });

    println!("[Jubby] Icon loaded successfully");

    // Build tray without menu - left click opens window directly
    let tray = TrayIconBuilder::with_id("jubby-tray")
        .icon(icon)
        .tooltip("Jubby")
        .icon_as_template(false)
        .on_tray_icon_event(|tray, event| {
            // Only respond to left-click release, ignore right-click
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    // Toggle window visibility
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            // Right-click is ignored (no action)
        })
        .build(app)?;

    println!("[Jubby] Tray icon created successfully!");
    Ok(tray)
}

pub fn handle_run_event(app_handle: &tauri::AppHandle, event: RunEvent) {
    if let RunEvent::WindowEvent { label, event, .. } = event {
        if label == "main" {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    // Prevent the window from closing, just hide it
                    api.prevent_close();
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                WindowEvent::Focused(focused) => {
                    // Hide popover when it loses focus (clicked outside)
                    if !focused {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                }
                _ => {}
            }
        }
    }
}
