mod storage;
mod tray;
mod window;

use tauri_plugin_global_shortcut::{Code, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("GDK_BACKEND", "x11");
    }

    let shortcut = Shortcut::new(None, Code::F12);
    eprintln!("[JUBBY] Registrando atalho: F12");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(shortcut)
                .expect("failed to register Alt+` shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Released {
                        window::toggle(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            storage::read_plugin_data,
            storage::write_plugin_data
        ])
        .setup(|app| {
            tray::setup_tray(app)?;
            eprintln!("[JUBBY] Setup completo. F12 deve funcionar agora.");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(tray::handle_run_event);
}
