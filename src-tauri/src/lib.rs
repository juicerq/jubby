mod enhancer;
mod settings;
mod storage;
mod tray;
mod window;

use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

use settings::{load_settings, parse_shortcut, CurrentShortcut};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Workaround para erro "Failed to create GBM buffer" em NVIDIA + Wayland
        // Força path de renderização compatível no WebKitGTK
        // https://github.com/tauri-apps/tauri/issues/13493
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");

        // Só força X11 se XWayland estiver disponível
        // Em sistemas Wayland puro sem XWayland, usa o backend padrão
        if std::path::Path::new("/usr/bin/Xwayland").exists()
            || std::env::var("DISPLAY").is_ok()
        {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    // Load settings and parse shortcut (fallback to F9 if invalid)
    let app_settings = load_settings();
    let shortcut_str = app_settings.global_shortcut.clone();
    let shortcut = parse_shortcut(&shortcut_str).unwrap_or(Shortcut::new(None, Code::F9));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
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
            settings::get_settings,
            settings::update_global_shortcut,
        ])
        .setup(move |app| {
            // Initialize database
            let db = storage::init_database(app)
                .map_err(|e| format!("Failed to initialize database: {}", e))?;
            app.manage(db);

            // Initialize current shortcut state (tracks what's registered)
            // Note: shortcut_str is captured from outer scope where settings were loaded
            app.manage(CurrentShortcut::new(shortcut_str.clone()));

            // Register the initial shortcut (handler is set globally in the plugin builder)
            // If shortcut is already registered, another instance is running - exit silently
            if let Err(e) = app.global_shortcut().register(shortcut) {
                if e.to_string().contains("already registered") {
                    eprintln!("[JUBBY] Another instance is already running");
                    std::process::exit(0);
                }
            }

            tray::setup_tray(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to build app");

    app.run(tray::handle_run_event);
}
