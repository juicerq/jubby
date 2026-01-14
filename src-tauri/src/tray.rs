use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    App,
};

use crate::window;

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

    // Create context menu (required for icon to appear on Linux/KDE)
    let show_item = MenuItem::with_id(app, "show", "Focar Jubby", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    // Build tray with menu - left click opens window, right click shows menu
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
