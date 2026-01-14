//! Registro automático de atalho global no KDE.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// Obtém o caminho do executável atual.
fn get_executable_path() -> Option<PathBuf> {
    std::env::current_exe().ok()
}

/// Registra o atalho Ctrl+1 no KDE para toggle do Jubby.
/// Usa kwriteconfig5/kwriteconfig6 para configurar.
#[tauri::command]
pub fn register_kde_shortcut() -> Result<String, String> {
    let exe_path = get_executable_path()
        .ok_or("Não foi possível obter o caminho do executável")?;

    let exe_str = exe_path.to_string_lossy();

    // Criar .desktop file para o Jubby Toggle
    let desktop_dir = dirs::data_local_dir()
        .ok_or("Não foi possível obter ~/.local/share")?
        .join("applications");

    fs::create_dir_all(&desktop_dir)
        .map_err(|e| format!("Erro ao criar diretório: {}", e))?;

    let desktop_file = desktop_dir.join("jubby-toggle.desktop");
    let desktop_content = format!(
        r#"[Desktop Entry]
Name=Jubby Toggle
Comment=Toggle Jubby visibility
Exec={} --toggle
Icon=jubby
Terminal=false
Type=Application
Categories=Utility;
NoDisplay=true
"#,
        exe_str
    );

    fs::write(&desktop_file, desktop_content)
        .map_err(|e| format!("Erro ao criar .desktop: {}", e))?;

    // Tentar registrar o atalho via kwriteconfig (Plasma 5 ou 6)
    let kwriteconfig = if Command::new("kwriteconfig6").arg("--help").output().is_ok() {
        "kwriteconfig6"
    } else {
        "kwriteconfig5"
    };

    // Registrar no kglobalshortcutsrc
    let result = Command::new(kwriteconfig)
        .args([
            "--file", "kglobalshortcutsrc",
            "--group", "jubby-toggle.desktop",
            "--key", "_launch",
            "Ctrl+1,none,Jubby Toggle"
        ])
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                // Recarregar configurações do KDE
                let _ = Command::new("dbus-send")
                    .args([
                        "--type=signal",
                        "--dest=org.kde.kglobalaccel",
                        "/kglobalaccel",
                        "org.kde.KGlobalAccel.yourShortcutsChanged",
                    ])
                    .output();

                // Alternativa: kquitapp5 + reiniciar kglobalaccel
                let _ = Command::new("kquitapp5").args(["kglobalaccel"]).output();
                let _ = Command::new("kquitapp6").args(["kglobalaccel"]).output();
                let _ = Command::new("kglobalaccel5").output();
                let _ = Command::new("kglobalaccel6").output();

                Ok(format!(
                    "Atalho Ctrl+1 registrado!\n\
                     Desktop file: {}\n\
                     Pode ser necessário fazer logout/login para ativar.",
                    desktop_file.display()
                ))
            } else {
                Err(format!(
                    "Erro ao registrar atalho: {}",
                    String::from_utf8_lossy(&output.stderr)
                ))
            }
        }
        Err(e) => Err(format!("kwriteconfig não encontrado: {}", e)),
    }
}

/// Verifica se o atalho está registrado.
#[tauri::command]
pub fn check_kde_shortcut() -> Result<bool, String> {
    let result = Command::new("kreadconfig5")
        .args([
            "--file", "kglobalshortcutsrc",
            "--group", "jubby-toggle.desktop",
            "--key", "_launch",
        ])
        .output()
        .or_else(|_| {
            Command::new("kreadconfig6")
                .args([
                    "--file", "kglobalshortcutsrc",
                    "--group", "jubby-toggle.desktop",
                    "--key", "_launch",
                ])
                .output()
        });

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            Ok(stdout.contains("Ctrl+1"))
        }
        Err(_) => Ok(false),
    }
}
