mod storage;
mod tray;
mod window;

use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            storage::read_plugin_data,
            storage::write_plugin_data
        ])
        .setup(|app| {
            tray::setup_tray(app)?;

            // Register global shortcut Alt+Q to toggle Jubby
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyQ);
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcut(shortcut)?
                    .with_handler(|app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            window::toggle_via_shortcut(app);
                        }
                    })
                    .build(),
            )?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(tray::handle_run_event);
}
