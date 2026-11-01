#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(all(not(debug_assertions), not(feature = "custom-protocol")))]
compile_error!("Release exige --features custom-protocol para embutir a interface.");

mod controls;
mod qcy_ble;
mod rcsp;
mod updates;
mod window;

use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter};
use btleplug::platform::{Manager, Peripheral};
use serde::Serialize;
use std::{collections::HashMap, time::Duration};
use tauri::State;
use tokio::{
    sync::Mutex,
    time::{sleep, timeout},
};
use uuid::Uuid;

#[derive(Default)]
struct Bluetooth {
    devices: Mutex<HashMap<String, Peripheral>>,
    operation: Mutex<()>,
}
#[derive(Serialize, Debug)]
struct Device {
    id: String,
    name: String,
    rssi: Option<i16>,
    connected: bool,
}
#[derive(Serialize, Debug)]
struct Details {
    battery: Option<u8>,
    services: Vec<String>,
    battery_note: Option<String>,
    characteristics: Vec<CharacteristicInfo>,
    advertisement: Option<Advertisement>,
    rcsp: Option<qcy_ble::QueryResult>,
}
#[derive(Serialize, Debug)]
struct CharacteristicInfo {
    service: String,
    uuid: String,
    properties: String,
}
#[derive(Serialize, Debug, PartialEq)]
struct Advertisement {
    vendor_id: u16,
    raw_hex: String,
    left: Option<u8>,
    right: Option<u8>,
    case: Option<u8>,
    charging: [bool; 3],
}
fn parse_advertisement(data: &[u8]) -> Option<Advertisement> {
    if data.len() < 20 {
        return None;
    }
    let level = |i: usize| {
        let v = data[i] & 0x7f;
        if v <= 100 {
            Some(v)
        } else {
            None
        }
    };
    Some(Advertisement {
        vendor_id: u16::from_be_bytes([data[0], data[1]]),
        raw_hex: data
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<Vec<_>>()
            .join(" "),
        left: level(5),
        right: level(6),
        case: level(7),
        charging: [
            data[5] & 0x80 != 0,
            data[6] & 0x80 != 0,
            data[7] & 0x80 != 0,
        ],
    })
}
fn message(e: impl std::fmt::Display) -> String {
    format!("Bluetooth: {e}")
}

#[tauri::command]
async fn scan_devices(
    state: State<'_, Bluetooth>,
    quick: Option<bool>,
) -> Result<ScanResult, String> {
    scan_with_mode(&state, quick.unwrap_or(false)).await
}
#[derive(Serialize, Debug)]
struct ScanResult {
    devices: Vec<Device>,
    warnings: Vec<String>,
}
async fn scan(state: &Bluetooth) -> Result<ScanResult, String> {
    scan_with_mode(state, false).await
}
async fn scan_with_mode(state: &Bluetooth, quick: bool) -> Result<ScanResult, String> {
    let _guard = state.operation.lock().await;
    let manager = Manager::new().await.map_err(message)?;
    let adapters = manager.adapters().await.map_err(message)?;
    if adapters.is_empty() {
        return Err(
            "Nenhum adaptador Bluetooth disponível. Verifique se o Bluetooth está ligado.".into(),
        );
    }
    let mut devices = Vec::new();
    let mut warnings = Vec::new();
    let mut found = HashMap::new();
    for adapter in adapters {
        let cached = adapter.peripherals().await.map_err(message)?;
        let mut ready = false;
        if quick {
            for p in &cached {
                if p.is_connected().await.unwrap_or(false)
                    && p.properties().await.ok().flatten().is_some_and(|v| {
                        v.local_name
                            .is_some_and(|n| n.to_lowercase().contains("n50"))
                    })
                {
                    ready = true;
                    break;
                }
            }
        }
        let peripherals = if ready {
            cached
        } else {
            adapter
                .start_scan(ScanFilter::default())
                .await
                .map_err(message)?;
            sleep(Duration::from_secs(5)).await;
            let result = adapter.peripherals().await;
            let stop = adapter.stop_scan().await;
            let values = result.map_err(message)?;
            stop.map_err(message)?;
            values
        };
        for peripheral in peripherals {
            // BlueZ may remove an object between enumeration and GetAll.
            let properties = match peripheral.properties().await {
                Ok(Some(properties)) => properties,
                Ok(None) => continue,
                Err(error) => {
                    warnings.push(format!(
                        "Um dispositivo deixou de responder durante a busca: {error}"
                    ));
                    continue;
                }
            };
            let id = peripheral.id().to_string();
            if found.contains_key(&id) {
                continue;
            }
            devices.push(Device {
                name: properties
                    .local_name
                    .filter(|n| !n.is_empty())
                    .unwrap_or_else(|| "Dispositivo sem nome".into()),
                rssi: properties.rssi,
                connected: peripheral.is_connected().await.unwrap_or(false),
                id: id.clone(),
            });
            found.insert(id, peripheral);
        }
    }
    devices.sort_by_key(|d| (!d.name.to_lowercase().contains("qcy"), d.name.clone()));
    *state.devices.lock().await = found;
    Ok(ScanResult { devices, warnings })
}

async fn read_details(peripheral: &Peripheral) -> Result<Details, String> {
    peripheral.discover_services().await.map_err(|e| {
        format!(
            "Falha ao descobrir serviços: {e}. Faça uma nova busca e selecione o fone novamente."
        )
    })?;
    let advertisement = peripheral.properties().await.ok().flatten().and_then(|p| {
        p.manufacturer_data
            .get(&0x521c)
            .and_then(|data| parse_advertisement(data))
    });
    let characteristics = peripheral
        .characteristics()
        .iter()
        .map(|c| CharacteristicInfo {
            service: c.service_uuid.to_string(),
            uuid: c.uuid.to_string(),
            properties: format!("{:?}", c.properties),
        })
        .collect();
    let services = peripheral
        .services()
        .iter()
        .map(|s| s.uuid.to_string())
        .collect();
    let battery_uuid = Uuid::from_u128(0x00002a19_0000_1000_8000_00805f9b34fb);
    let characteristic = peripheral
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == battery_uuid);
    let (battery, battery_note) = match characteristic {
        Some(c) => match peripheral.read(&c).await {
            Ok(bytes) => match bytes.first().copied().filter(|v| *v <= 100) {
                Some(value) => (Some(value), None),
                None => (None, Some("O fone retornou uma leitura de bateria inválida.".into())),
            },
            Err(_) => (None, Some("O fone anuncia bateria, mas a leitura falhou. Verifique o pareamento no sistema.".into())),
        },
        None => (None, Some("Este dispositivo não disponibilizou o serviço padrão de bateria. A leitura pode exigir o protocolo QCY.".into())),
    };
    let rcsp = if advertisement.as_ref().is_some_and(|a| a.vendor_id == 18298) {
        Some(qcy_ble::query_battery(peripheral).await)
    } else {
        None
    };
    Ok(Details {
        battery,
        services,
        battery_note,
        characteristics,
        advertisement,
        rcsp,
    })
}

#[tauri::command]
async fn inspect_device(id: String, state: State<'_, Bluetooth>) -> Result<Details, String> {
    inspect(&id, &state).await
}
async fn inspect(id: &str, state: &Bluetooth) -> Result<Details, String> {
    let _guard = state.operation.lock().await;
    let peripheral = state
        .devices
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or("Dispositivo não encontrado. Faça uma nova busca.")?;
    let already_connected = peripheral.is_connected().await.map_err(|e| {
        format!("O dispositivo selecionado não está mais disponível: {e}. Faça uma nova busca.")
    })?;
    let result = timeout(Duration::from_secs(30), async {
        if !already_connected {
            peripheral.connect().await.map_err(message)?;
        }
        read_details(&peripheral).await
    })
    .await
    .unwrap_or_else(|_| {
        Err("O fone não respondeu em 30 segundos. Aproxime-o e tente novamente.".into())
    });
    // Preserve connections owned by the system. Release only the temporary BLE connection.
    if !already_connected {
        match timeout(Duration::from_secs(5), peripheral.disconnect()).await {
            Ok(Ok(())) => (),
            _ => return Err("A consulta terminou, mas a conexão temporária não pôde ser encerrada. Verifique o Bluetooth do sistema.".into()),
        }
    }
    result
}

#[tauri::command]
async fn control_device(
    id: String,
    action: String,
    mode: Option<u8>,
    gains: Option<Vec<f64>>,
    noise: Option<controls::Noise>,
    preset: Option<u8>,
    state: State<'_, Bluetooth>,
) -> Result<controls::Controls, String> {
    let _guard = state.operation.lock().await;
    let p = state
        .devices
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or("Faça uma nova busca")?;
    let props = p
        .properties()
        .await
        .map_err(message)?
        .ok_or("Fone indisponível")?;
    if !props
        .manufacturer_data
        .get(&0x521c)
        .and_then(|d| parse_advertisement(d))
        .is_some_and(|a| a.vendor_id == 18298)
    {
        return Err("Modelo não suportado".into());
    }
    let connected = p.is_connected().await.map_err(message)?;
    let result = timeout(Duration::from_secs(60), async {
        if !connected {
            p.connect().await.map_err(message)?;
        }
        p.discover_services().await.map_err(message)?;
        match action.as_str() {
            "read" => Ok(controls::read(&p).await),
            "noise" => match noise {
                Some(target) => controls::set_noise_config(&p, target).await,
                None => controls::set_noise(&p, mode.ok_or("Modo ausente")?).await,
            },
            "preset" => controls::set_preset(&p, preset.ok_or("Preset absent")?).await,
            "eq" => controls::set_eq(&p, gains.ok_or("Ganhos ausentes")?).await,
            _ => Err("Ação inválida".into()),
        }
    })
    .await
    .unwrap_or_else(|_| Err("Tempo esgotado; atualize para conferir o estado".into()));
    if !connected {
        let _ = timeout(Duration::from_secs(3), p.disconnect()).await;
    }
    result
}
#[tauri::command]
fn list_presets() -> Vec<controls::Preset> {
    controls::presets()
}
fn main() {
    if std::env::args().any(|a| a == "--update-installed") {
        let state = updates::Updater::default();
        if let Err(e) = updates::start(&state) {
            eprintln!("{e}");
            std::process::exit(1)
        }
        loop {
            let snapshot = state.0.lock().unwrap().clone();
            if snapshot.phase != "building" {
                println!("{}: {}", snapshot.phase, snapshot.message);
                for line in snapshot.log {
                    println!("{line}")
                }
                if snapshot.phase != "ready" {
                    std::process::exit(1)
                }
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
        return;
    }

    if std::env::args().any(|a| a == "--version") {
        println!("QCY Desktop {}", env!("CARGO_PKG_VERSION"));
        return;
    }

    if std::env::args().any(|arg| arg == "--diagnose-bluetooth") {
        let result: Result<(), String> = tauri::async_runtime::block_on(async {
            let state = Bluetooth::default();
            let result = if std::env::args().any(|a| a == "--quick-scan") {
                scan_with_mode(&state, true).await?
            } else {
                scan(&state).await?
            };
            println!("Busca: {result:?}");
            if let Some(device) = result
                .devices
                .iter()
                .find(|d| d.name.to_lowercase().contains("n50-app"))
            {
                println!("Consulta N50: {:?}", inspect(&device.id, &state).await?);
                if std::env::args().any(|a| a == "--diagnose-controls") {
                    let p = state.devices.lock().await.get(&device.id).cloned().unwrap();
                    p.discover_services().await.map_err(message)?;
                    let original = controls::read(&p).await;
                    println!("Controles: {:?}", original);
                    if std::env::args().any(|a| a == "--benchmark-controls") {
                        let started = std::time::Instant::now();
                        let _ = controls::read(&p).await;
                        println!("PERF read_ms={}", started.elapsed().as_millis());
                        if let Some(ref n) = original.noise {
                            let started = std::time::Instant::now();
                            let result = controls::set_noise_config(&p, n.clone()).await;
                            println!(
                                "PERF same_noise_ms={} ok={}",
                                started.elapsed().as_millis(),
                                result.is_ok()
                            );
                        }
                    }

                    if std::env::args().any(|a| a == "--exercise-presets") {
                        if let Some(ref eq) = original.eq {
                            for preset in controls::presets() {
                                let r = controls::set_preset(&p, preset.id).await;
                                println!(
                                    "Preset {}: {:?}",
                                    preset.name,
                                    r.as_ref()
                                        .map(|c| c.eq.as_ref().map(|eq| (eq.mode, &eq.gains)))
                                );
                            }
                            println!(
                                "Restaurar EQ: {:?}",
                                qcy_ble::transact(&p, 255, &eq.raw, false).await
                            );
                            let restored = controls::read(&p).await;
                            println!(
                                "EQ original restaurado: {}",
                                restored.eq.as_ref() == Some(eq)
                            );
                        }
                    }

                    if std::env::args().any(|a| a == "--exercise-anc-levels") {
                        if let Some(ref noise) = original.noise {
                            for (scene, gain) in [(1, 0), (1, 2), (2, 1), (3, 2), (4, 0), (5, 0)] {
                                let target = controls::Noise {
                                    mode: 1,
                                    scene,
                                    gain,
                                };
                                let r = controls::set_noise_config(&p, target).await;
                                println!(
                                    "ANC cena {scene} nível {gain}: {:?}",
                                    r.as_ref().map(|c| &c.noise)
                                );
                            }
                            let r = controls::set_noise_config(&p, noise.clone()).await;
                            println!("Restaurar ANC original: {:?}", r.as_ref().map(|c| &c.noise));
                        }
                    }

                    if std::env::args().any(|a| a == "--exercise-eq") {
                        if let Some(ref eq) = original.eq {
                            let mut gains = eq.gains.clone();
                            gains[0] = (gains[0] - 0.5).max(-8.0);
                            println!("Teste EQ: {:?}", controls::set_eq(&p, gains).await);
                            println!(
                                "Restaurar EQ: {:?}",
                                qcy_ble::transact(&p, 255, &eq.raw, false).await
                            );
                            let restored = controls::read(&p).await;
                            println!(
                                "EQ restaurado exatamente: {}",
                                restored.eq.as_ref() == Some(eq)
                            );
                        }
                    }

                    if std::env::args().any(|a| a == "--exercise-controls") {
                        if let Some(noise) = original.noise {
                            for mode in [1, 3] {
                                println!(
                                    "Teste modo {mode}: {:?}",
                                    controls::set_noise(&p, mode).await
                                );
                            }
                            let restored = qcy_ble::transact(
                                &p,
                                255,
                                &[23, 3, noise.mode, noise.scene, noise.gain],
                                false,
                            )
                            .await;
                            println!(
                                "Restaurar ANC: {:?}; estado {:?}",
                                restored,
                                controls::read(&p).await
                            );
                        }
                    }
                }
            }
            Ok(())
        });
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    tauri::Builder::default()
        .setup(window::setup)
        .on_window_event(window::on_event)
        .manage(Bluetooth::default())
        .manage(updates::Updater::default())
        .invoke_handler(tauri::generate_handler![
            scan_devices,
            inspect_device,
            control_device,
            list_presets,
            updates::update_status,
            updates::start_local_update,
            updates::restart_installed,
            window::window_preferences,
            window::save_window_preferences,
            window::finish_close
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao iniciar QCY Desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn advertisement_checks_length_ranges_and_charging() {
        assert!(parse_advertisement(&[0; 19]).is_none());
        let mut bytes = [0u8; 24];
        bytes[0] = 0x47;
        bytes[1] = 0x7c;
        bytes[5] = 0x80 | 42;
        bytes[6] = 100;
        bytes[7] = 127;
        let parsed = parse_advertisement(&bytes).unwrap();
        assert_eq!(parsed.vendor_id, 18300);
        assert_eq!(
            (parsed.left, parsed.right, parsed.case),
            (Some(42), Some(100), None)
        );
        assert_eq!(parsed.charging, [true, false, false]);
    }
}
