use tauri::{
    image::Image,
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
    App, Manager, PhysicalPosition, Position, RunEvent, Size, WindowEvent,
};

pub fn setup_tray(app: &App) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    // Use the default window icon from tauri.conf.json bundle
    let icon = app
        .default_window_icon()
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
            if let TrayIconEvent::Click {
                position,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        // Position the window near the tray icon
                        // Get window size
                        let window_size = window.outer_size().unwrap_or_default();

                        // Extract position and size from the rect enums
                        let (rect_x, rect_y) = match rect.position {
                            Position::Physical(pos) => (pos.x as f64, pos.y as f64),
                            Position::Logical(pos) => (pos.x, pos.y),
                        };
                        let (rect_width, rect_height) = match rect.size {
                            Size::Physical(size) => (size.width as f64, size.height as f64),
                            Size::Logical(size) => (size.width, size.height),
                        };

                        // Calculate position: center horizontally on tray icon, above/below it
                        let tray_center_x = rect_x + (rect_width / 2.0);
                        let x = tray_center_x - (window_size.width as f64 / 2.0);

                        // Determine if tray is at top or bottom of screen
                        // If tray Y position is small, it's at top -> show window below
                        // Otherwise, show window above the tray
                        let y = if position.y < 100.0 {
                            // Tray at top, show below
                            rect_y + rect_height + 8.0
                        } else {
                            // Tray at bottom, show above
                            rect_y - window_size.height as f64 - 8.0
                        };

                        let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
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
