use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    App, RunEvent, WindowEvent,
};

use super::window;

pub fn setup_tray(app: &App) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    let icon = app
        .default_window_icon()
        .cloned()
        .or_else(|| Image::from_bytes(include_bytes!("../../icons/32x32.png")).ok())
        .ok_or("Failed to load tray icon: no default icon and embedded icon failed")?;

    let show_item = MenuItem::with_id(app, "show", "Focus Jubby", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let tray = TrayIconBuilder::with_id("jubby-tray")
        .icon(icon)
        .tooltip("Jubby")
        .icon_as_template(false)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => window::show(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(tray)
}

pub fn handle_run_event(app_handle: &tauri::AppHandle, event: RunEvent) {
    if let RunEvent::WindowEvent { label, event, .. } = event {
        if label == "main" {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    window::hide(app_handle);
                }
                WindowEvent::Focused(focused) => {
                    if !focused {
                        window::hide_on_blur(app_handle);
                    }
                }
                _ => {}
            }
        }
    }
}
