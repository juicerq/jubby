mod core;
mod plugins;
mod shared;

use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

use core::settings::{load_settings, parse_shortcut, CurrentShortcut};

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    let file_uri = format!("file://{}", path);

    let result = std::process::Command::new("dbus-send")
        .args([
            "--session",
            "--dest=org.freedesktop.FileManager1",
            "--type=method_call",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
            &format!("array:string:{}", file_uri),
            "string:",
        ])
        .spawn();

    match result {
        Ok(_) => Ok(()),
        Err(_) => {
            let folder = std::path::Path::new(&path)
                .parent()
                .unwrap_or(std::path::Path::new(&path));

            std::process::Command::new("gio")
                .arg("open")
                .arg(folder)
                .spawn()
                .or_else(|_| {
                    std::process::Command::new("xdg-open")
                        .arg(folder)
                        .spawn()
                })
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");

        if std::path::Path::new("/usr/bin/Xwayland").exists()
            || std::env::var("DISPLAY").is_ok()
        {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    let app_settings = load_settings();
    let shortcut_str = app_settings.global_shortcut.clone();
    let shortcut = parse_shortcut(&shortcut_str).unwrap_or(Shortcut::new(None, Code::F9));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Released {
                        core::window::toggle(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            // Todo plugin
            plugins::todo::commands::folder_get_all,
            plugins::todo::commands::folder_create,
            plugins::todo::commands::folder_rename,
            plugins::todo::commands::folder_delete,
            plugins::todo::commands::folder_reorder,
            plugins::todo::commands::todo_get_by_folder,
            plugins::todo::commands::todo_create,
            plugins::todo::commands::todo_update_status,
            plugins::todo::commands::todo_delete,
            plugins::todo::commands::todo_set_tags,
            plugins::todo::commands::tag_create,
            plugins::todo::commands::tag_update,
            plugins::todo::commands::tag_delete,
            // QuickClip plugin
            plugins::quickclip::enhancer::enhance_prompt,
            plugins::quickclip::capture::screenshot::capture_get_sources,
            plugins::quickclip::capture::screenshot::capture_monitor,
            plugins::quickclip::capture::screenshot::capture_window,
            plugins::quickclip::capture::screenshot::capture_primary,
            plugins::quickclip::recorder::commands::recorder_check_ffmpeg,
            plugins::quickclip::recorder::commands::recorder_start,
            plugins::quickclip::recorder::commands::recorder_stop,
            plugins::quickclip::recorder::commands::recorder_status,
            plugins::quickclip::recorder::commands::recorder_delete_video,
            plugins::quickclip::persistence::quickclip_get_recordings,
            plugins::quickclip::persistence::quickclip_save_recording,
            plugins::quickclip::persistence::quickclip_delete_recording,
            plugins::quickclip::persistence::quickclip_get_settings,
            plugins::quickclip::persistence::quickclip_update_settings,
            plugins::quickclip::recorder::commands::read_video_file,
            plugins::quickclip::clipboard::copy_file_to_clipboard,
            // Core
            core::settings::get_settings,
            core::settings::update_global_shortcut,
            core::logging::log_from_frontend,
            reveal_in_folder,
        ])
        .setup(move |app| {
            // Initialize logging first
            let logging_guards = core::logging::init_logging();
            app.manage(core::logging::LoggingState::new(logging_guards));

            // Initialize todo store (migrates from SQLite if needed)
            let todo_store = plugins::todo::init_todo_store()
                .map_err(|e| format!("Failed to initialize todo store: {}", e))?;
            app.manage(todo_store);

            // Initialize recorder state
            app.manage(plugins::quickclip::recorder::RecorderState::new());

            // Initialize current shortcut state
            app.manage(CurrentShortcut::new(shortcut_str.clone()));

            // Register the initial shortcut
            if let Err(e) = app.global_shortcut().register(shortcut) {
                if e.to_string().contains("already registered") {
                    tracing::warn!(target: "system", "Another instance is already running");
                    std::process::exit(0);
                }
            }

            core::tray::setup_tray(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to build app");

    app.run(core::tray::handle_run_event);
}
