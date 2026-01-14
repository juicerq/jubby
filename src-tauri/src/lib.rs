mod shortcut;
mod storage;
mod tray;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Forçar XWayland no Linux para resolver problemas de foco com apps Electron
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("GDK_BACKEND", "x11");
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Segunda instância foi chamada - verifica se é toggle
            eprintln!("[JUBBY] single-instance: args={:?}", args);
            if args.iter().any(|arg| arg == "--toggle" || arg == "toggle") {
                eprintln!("[JUBBY] -> toggle via single-instance");
                window::toggle_via_shortcut(app);
            } else {
                // Apenas mostrar a janela se não for toggle
                window::show(app);
            }
        }))
        .invoke_handler(tauri::generate_handler![
            storage::read_plugin_data,
            storage::write_plugin_data,
            shortcut::register_kde_shortcut,
            shortcut::check_kde_shortcut
        ])
        .setup(|app| {
            tray::setup_tray(app)?;

            // Registrar atalho KDE automaticamente se não existir
            match shortcut::check_kde_shortcut() {
                Ok(false) => {
                    eprintln!("[JUBBY] Registrando atalho Ctrl+1 no KDE...");
                    match shortcut::register_kde_shortcut() {
                        Ok(msg) => eprintln!("[JUBBY] {}", msg),
                        Err(e) => eprintln!("[JUBBY] Erro ao registrar atalho: {}", e),
                    }
                }
                Ok(true) => {
                    eprintln!("[JUBBY] Atalho Ctrl+1 já registrado no KDE.");
                }
                Err(e) => {
                    eprintln!("[JUBBY] Não foi possível verificar atalho: {}", e);
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_, _| {});
}
