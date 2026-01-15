mod enhancer;
mod storage;
mod tray;
mod window;

use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Só força X11 se XWayland estiver disponível
        // Em sistemas Wayland puro sem XWayland, usa o backend padrão
        if std::path::Path::new("/usr/bin/Xwayland").exists()
            || std::env::var("DISPLAY").is_ok()
        {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    let shortcut = Shortcut::new(None, Code::F9);
    eprintln!("[JUBBY] Registrando atalho: F9");

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
            storage::todo::todo_get_all,
            storage::todo::todo_create,
            storage::todo::todo_update_status,
            storage::todo::todo_delete,
            storage::todo::todo_set_tags,
            storage::todo::tag_create,
            storage::todo::tag_update,
            storage::todo::tag_delete,
            enhancer::enhance_prompt,
        ])
        .setup(|app| {
            // Initialize database
            let db = storage::init_database(app)
                .map_err(|e| format!("Failed to initialize database: {}", e))?;
            app.manage(db);

            tray::setup_tray(app)?;
            eprintln!("[JUBBY] Setup completo. F9 deve funcionar agora.");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(tray::handle_run_event);
}
