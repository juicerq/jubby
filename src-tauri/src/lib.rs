mod core;
mod plugins;
mod shared;

use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

use core::settings::{load_settings, parse_shortcut, CurrentQuickClipShortcut, CurrentShortcut};
use plugins::quickclip::persistence::load_quickclip_settings;

const TOGGLE_ARG: &str = "--toggle";

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
    let window_shortcut_str = app_settings.global_shortcut.clone();
    let window_shortcut =
        parse_shortcut(&window_shortcut_str).unwrap_or(Shortcut::new(None, Code::F9));

    let quickclip_settings = load_quickclip_settings().unwrap_or_default();
    let quickclip_shortcut_str = quickclip_settings.hotkey.clone();
    let quickclip_shortcut = parse_shortcut(&quickclip_shortcut_str).ok();

    let window_shortcut_for_handler = window_shortcut.clone();
    let quickclip_shortcut_for_handler = quickclip_shortcut.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            tracing::info!(target: "system", "Single instance callback: argv={:?}", argv);
            let should_toggle = argv.iter().any(|arg| arg == TOGGLE_ARG);
            tracing::info!(target: "system", "should_toggle={}, TOGGLE_ARG={}", should_toggle, TOGGLE_ARG);
            if should_toggle {
                core::window::toggle(app);
            } else {
                core::window::show(app);
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    tracing::debug!(target: "system", "Shortcut event: {:?} state={:?}", shortcut, event.state);
                    if event.state == ShortcutState::Released {
                        if shortcut == &window_shortcut_for_handler {
                            tracing::info!(target: "system", "Window shortcut triggered");
                            core::window::toggle(app);
                        } else if quickclip_shortcut_for_handler
                            .as_ref()
                            .map_or(false, |qs| shortcut == qs)
                        {
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                plugins::quickclip::recorder::commands::toggle_recording_with_notification(&app_handle).await;
                            });
                        }
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
            plugins::quickclip::persistence::quickclip_update_hotkey,
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

            let (coordinator, command_tx) = plugins::quickclip::recorder::coordinator::RecordingCoordinator::new();
            let handle = plugins::quickclip::recorder::coordinator::CoordinatorHandle::new(command_tx);
            app.manage(handle);
            tauri::async_runtime::spawn(coordinator.run());

            app.manage(CurrentShortcut::new(window_shortcut_str.clone()));
            app.manage(CurrentQuickClipShortcut::new(quickclip_shortcut_str.clone()));

            let is_hyprland = core::hyprland::is_hyprland();
            tracing::info!(target: "system", "Starting Jubby (Hyprland: {})", is_hyprland);

            if is_hyprland {
                if let Err(e) = core::hyprland::ensure_hyprland_binding(&window_shortcut_str) {
                    tracing::warn!(target: "system", "Failed to setup Hyprland binding: {}", e);
                }
                if let Err(e) = core::hyprland::ensure_window_rules() {
                    tracing::warn!(target: "system", "Failed to setup Hyprland window rules: {}", e);
                }
            } else {
                match app.global_shortcut().register(window_shortcut) {
                    Ok(_) => {
                        tracing::info!(target: "system", "Registered global shortcut: {}", window_shortcut_str);
                    }
                    Err(e) => {
                        if e.to_string().contains("already registered") {
                            tracing::warn!(target: "system", "Another instance is already running");
                            std::process::exit(0);
                        }
                        tracing::warn!(target: "system", "Failed to register window shortcut: {}", e);
                    }
                }
            }

            if let Some(qs) = quickclip_shortcut {
                if let Err(e) = app.global_shortcut().register(qs) {
                    tracing::warn!(target: "quickclip", "Failed to register QuickClip shortcut: {}", e);
                }
            }

            core::tray::setup_tray(app)?;
            core::tray::setup_recording_listener(app);

            if !is_hyprland {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to build app");

    app.run(core::tray::handle_run_event);
}
