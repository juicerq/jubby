use std::fs;
use std::path::PathBuf;

const JUBBY_BINDING_MARKER: &str = "# jubby-managed-binding";
const BINDINGS_FILE: &str = ".config/hypr/bindings.conf";
const HYPRLAND_CONF: &str = ".config/hypr/hyprland.conf";
const JUBBY_CONF: &str = ".config/hypr/jubby.conf";

const JUBBY_WINDOW_RULES: &str = r#"# Jubby window rules (auto-generated)
windowrulev2 = workspace special:jubby silent, class:^(Jubby)$
windowrulev2 = float, class:^(Jubby)$
windowrulev2 = size 400 350, class:^(Jubby)$

# Prevent cursor from warping when focusing Jubby
cursor {
    no_warps = true
}
"#;

pub fn is_hyprland() -> bool {
    std::env::var("HYPRLAND_INSTANCE_SIGNATURE").is_ok()
}

fn get_bindings_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(BINDINGS_FILE))
}

fn get_jubby_conf_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(JUBBY_CONF))
}

fn get_hyprland_conf_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(HYPRLAND_CONF))
}

fn reload_hyprland_config() {
    let _ = std::process::Command::new("hyprctl")
        .arg("reload")
        .spawn();
}

fn build_binding_line(shortcut: &str) -> String {
    let parts: Vec<&str> = shortcut.split('+').collect();

    let (modifiers, key) = if parts.len() == 1 {
        (String::new(), parts[0].to_string())
    } else {
        let key = parts.last().unwrap().to_string();
        let mods: Vec<String> = parts[..parts.len() - 1]
            .iter()
            .map(|m| {
                match *m {
                    "Ctrl" => "CTRL",
                    "Alt" => "ALT",
                    "Shift" => "SHIFT",
                    "Super" => "SUPER",
                    other => other,
                }
                .to_string()
            })
            .collect();
        (mods.join(" "), key)
    };

    format!(
        "bindd = {}, {}, Jubby, exec, ~/.local/bin/jubby-toggle {}",
        modifiers, key, JUBBY_BINDING_MARKER
    )
}

pub fn update_hyprland_binding(new_shortcut: &str) -> Result<(), String> {
    let path = get_bindings_path().ok_or("Could not find home directory")?;

    if !path.exists() {
        return Err(format!("Bindings file not found: {:?}", path));
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let new_binding = build_binding_line(new_shortcut);

    let new_content = if content.contains(JUBBY_BINDING_MARKER) {
        content
            .lines()
            .map(|line| {
                if line.contains(JUBBY_BINDING_MARKER) {
                    new_binding.as_str()
                } else {
                    line
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        format!("{}\n\n{}", new_binding, content)
    };

    fs::write(&path, new_content).map_err(|e| e.to_string())?;

    tracing::info!(target: "system", "Updated Hyprland binding: {}", new_shortcut);
    reload_hyprland_config();

    Ok(())
}

pub fn ensure_hyprland_binding(shortcut: &str) -> Result<(), String> {
    let path = get_bindings_path().ok_or("Could not find home directory")?;

    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

    let needs_update = if content.contains(JUBBY_BINDING_MARKER) {
        content.lines().any(|line| {
            line.contains(JUBBY_BINDING_MARKER) && line.contains("jubby-toggle")
        })
    } else {
        true
    };

    if needs_update {
        update_hyprland_binding(shortcut)?;
    }

    Ok(())
}

pub fn ensure_window_rules() -> Result<(), String> {
    let jubby_conf = get_jubby_conf_path().ok_or("Could not find home directory")?;
    let hyprland_conf = get_hyprland_conf_path().ok_or("Could not find home directory")?;

    if !hyprland_conf.exists() {
        return Ok(());
    }

    let needs_update = if jubby_conf.exists() {
        let current = fs::read_to_string(&jubby_conf).unwrap_or_default();
        current != JUBBY_WINDOW_RULES
    } else {
        true
    };

    if needs_update {
        fs::write(&jubby_conf, JUBBY_WINDOW_RULES).map_err(|e| e.to_string())?;

        let hyprland_content = fs::read_to_string(&hyprland_conf).map_err(|e| e.to_string())?;
        let source_line = "source = ~/.config/hypr/jubby.conf";

        if !hyprland_content.contains(source_line) {
            let new_content = format!("{}\n{}", source_line, hyprland_content);
            fs::write(&hyprland_conf, new_content).map_err(|e| e.to_string())?;
        }

        reload_hyprland_config();
    }

    Ok(())
}
