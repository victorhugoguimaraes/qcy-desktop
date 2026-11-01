use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
#[derive(Debug, Default, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloseAction {
    #[default]
    Ask,
    Tray,
    Exit,
}
#[derive(Default, Serialize, Deserialize)]
pub struct Settings {
    close_action: CloseAction,
}
pub struct Preferences {
    path: PathBuf,
    action: Mutex<CloseAction>,
}
impl Preferences {
    pub fn load(path: PathBuf) -> Self {
        let action = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Settings>(&b).ok())
            .unwrap_or_default()
            .close_action;
        Self {
            path,
            action: Mutex::new(action),
        }
    }
    pub fn get(&self) -> Result<CloseAction, String> {
        self.action
            .lock()
            .map(|a| *a)
            .map_err(|_| "Preferências indisponíveis".into())
    }
    pub fn save(&self, action: CloseAction) -> Result<(), String> {
        let mut current = self
            .action
            .lock()
            .map_err(|_| "Preferências indisponíveis")?;
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?
        }
        let temporary = self.path.with_extension("tmp");
        std::fs::write(
            &temporary,
            serde_json::to_vec(&Settings {
                close_action: action,
            })
            .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        std::fs::rename(temporary, &self.path).map_err(|e| e.to_string())?;
        *current = action;
        Ok(())
    }
}
#[tauri::command]
pub fn window_preferences(state: tauri::State<'_, Preferences>) -> Result<Settings, String> {
    Ok(Settings {
        close_action: state.get()?,
    })
}
#[tauri::command]
pub fn save_window_preferences(
    state: tauri::State<'_, Preferences>,
    action: CloseAction,
) -> Result<(), String> {
    state.save(action)
}
#[tauri::command]
pub fn finish_close(
    app: tauri::AppHandle,
    state: tauri::State<'_, Preferences>,
    action: CloseAction,
    remember: bool,
) -> Result<(), String> {
    if action == CloseAction::Ask {
        return Err("Escolha continuar na bandeja ou encerrar".into());
    }
    if action == CloseAction::Tray && app.tray_by_id("qcy").is_none() {
        return Err(
            "Bandeja indisponível neste ambiente. Você pode encerrar ou minimizar a janela.".into(),
        );
    }
    if remember {
        state.save(action)?
    }
    match action {
        CloseAction::Tray => app
            .get_webview_window("main")
            .ok_or("Janela indisponível")?
            .hide()
            .map_err(|e| e.to_string())?,
        CloseAction::Exit => app.exit(0),
        _ => {}
    }
    Ok(())
}
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
    };
    app.manage(Preferences::load(
        app.path().app_data_dir()?.join("window.json"),
    ));
    let open = MenuItem::with_id(app, "open", "Abrir QCY Desktop", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Encerrar", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &exit])?;
    let mut tray = TrayIconBuilder::with_id("qcy")
        .menu(&menu)
        .tooltip("QCY Desktop")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "exit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone())
    }
    if let Err(e) = tray.build(app) {
        eprintln!("Bandeja indisponível: {e}")
    }
    Ok(())
}
pub fn on_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        match app.state::<Preferences>().get().unwrap_or_default() {
            CloseAction::Exit => {}
            CloseAction::Tray if app.tray_by_id("qcy").is_some() => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {
                api.prevent_close();
                let _ = window.emit("choose-close", ());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preference_survives_restart_and_bad_file_falls_back_to_asking() {
        let dir = std::env::temp_dir().join(format!("qcy-window-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("window.json");
        let store = Preferences::load(path.clone());
        assert_eq!(store.get().unwrap(), CloseAction::Ask);
        store.save(CloseAction::Tray).unwrap();
        assert_eq!(
            Preferences::load(path.clone()).get().unwrap(),
            CloseAction::Tray
        );
        store.save(CloseAction::Exit).unwrap();
        assert_eq!(
            Preferences::load(path.clone()).get().unwrap(),
            CloseAction::Exit
        );
        std::fs::write(&path, b"{broken").unwrap();
        assert_eq!(
            Preferences::load(path.clone()).get().unwrap(),
            CloseAction::Ask
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
