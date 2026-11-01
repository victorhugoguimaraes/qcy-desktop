//! Local source updater: invokes only this project's fixed installer, never downloads code.
use serde::Serialize;
use std::{
    collections::VecDeque,
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
};
#[derive(Clone, Serialize)]
pub struct Status {
    pub phase: String,
    pub message: String,
    pub log: VecDeque<String>,
    pub version: String,
    pub local: bool,
}
impl Default for Status {
    fn default() -> Self {
        Self {
            phase: "idle".into(),
            message: "Atualiza a instalação a partir do projeto local.".into(),
            log: VecDeque::new(),
            version: env!("CARGO_PKG_VERSION").into(),
            local: cfg!(target_os = "linux") && script().is_file(),
        }
    }
}
#[derive(Default)]
pub struct Updater(pub Arc<Mutex<Status>>);
fn script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/install-linux.sh")
}
fn push(state: &Arc<Mutex<Status>>, line: String) {
    if let Ok(mut s) = state.lock() {
        s.log.push_back(line);
        while s.log.len() > 120 {
            s.log.pop_front();
        }
    }
}
#[tauri::command]
pub fn update_status(state: tauri::State<'_, Updater>) -> Result<Status, String> {
    state
        .0
        .lock()
        .map(|s| s.clone())
        .map_err(|_| "Falha ao ler atualização".into())
}
#[tauri::command]
pub fn start_local_update(state: tauri::State<'_, Updater>) -> Result<Status, String> {
    start(&state)
}
pub fn start(state: &Updater) -> Result<Status, String> {
    if !cfg!(target_os = "linux") {
        return Err("Atualizador local disponível apenas no Linux nesta versão".into());
    }
    if !script().is_file() {
        return Err(
            "O projeto de origem não foi encontrado. Reinstale pelo pacote mais recente.".into(),
        );
    }
    let mut status = state.0.lock().map_err(|_| "Atualizador ocupado")?;
    if status.phase == "building" {
        return Ok(status.clone());
    }
    status.phase = "building".into();
    status.message = "Compilando alterações do projeto. Você pode continuar usando o app.".into();
    status.log.clear();
    let initial = status.clone();
    let shared = state.0.clone();
    drop(status);
    std::thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            let mut child = Command::new("bash")
                .arg(script())
                .env("CARGO_TERM_COLOR", "never")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Não foi possível iniciar a atualização: {e}"))?;
            let stderr = child.stderr.take().ok_or("Sem saída de compilação")?;
            let copy = shared.clone();
            let reader = std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    push(&copy, line)
                }
            });
            if let Some(stdout) = child.stdout.take() {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    push(&shared, line)
                }
            }
            let exit = child.wait().map_err(|e| e.to_string())?;
            let _ = reader.join();
            if !exit.success() {
                return Err(format!("Atualização não concluída ({exit}). A versão instalada continua disponível. Veja os detalhes."));
            }
            Ok(())
        })();
        if let Ok(mut s) = shared.lock() {
            match result {
                Ok(()) => {
                    s.phase = "ready".into();
                    s.message = "Nova compilação instalada. Reinicie o app para utilizá-la.".into()
                }
                Err(e) => {
                    s.phase = "error".into();
                    s.message = e
                }
            }
        }
    });
    Ok(initial)
}
#[tauri::command]
pub fn restart_installed(
    app: tauri::AppHandle,
    state: tauri::State<'_, Updater>,
) -> Result<(), String> {
    if state.0.lock().map_err(|_| "Atualizador ocupado")?.phase != "ready" {
        return Err("A atualização ainda não terminou".into());
    }
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .ok_or("Diretório de instalação indisponível")?;
    let exe = data.join("qcy-desktop/qcy-desktop");
    Command::new(exe)
        .spawn()
        .map_err(|e| format!("Não foi possível reiniciar: {e}"))?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn logs_remain_bounded() {
        let state = Arc::new(Mutex::new(Status::default()));
        for i in 0..300 {
            push(&state, i.to_string())
        }
        let s = state.lock().unwrap();
        assert_eq!(s.log.len(), 120);
        assert_eq!(s.log.front().unwrap(), "180");
    }
    #[test]
    fn duplicate_request_does_not_spawn_second_build() {
        let state = Updater::default();
        state.0.lock().unwrap().phase = "building".into();
        assert_eq!(start(&state).unwrap().phase, "building");
        assert!(state.0.lock().unwrap().log.is_empty());
    }
}
