use crate::qcy_ble::Session;
use btleplug::platform::Peripheral;
use serde::{Deserialize, Serialize};
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Noise {
    pub mode: u8,
    pub scene: u8,
    pub gain: u8,
}
#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Eq {
    pub mode: u8,
    pub gains: Vec<f64>,
    pub frequencies: Vec<u16>,
    pub raw: Vec<u8>,
}

#[derive(Debug, Serialize, Default)]
pub struct Controls {
    pub noise: Option<Noise>,
    pub eq: Option<Eq>,
    pub errors: Vec<String>,
}
fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|v| format!("{v:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}
pub async fn read(p: &Peripheral) -> Controls {
    let mut session = match Session::open(p).await {
        Ok(s) => s,
        Err(e) => {
            return Controls {
                errors: vec![e],
                ..Default::default()
            }
        }
    };
    let mut state = Controls::default();
    match read_noise(&mut session).await {
        Ok(n) => state.noise = Some(n),
        Err(e) => state.errors.push(format!("ANC: {e}")),
    }
    match read_eq(&mut session).await {
        Ok(eq) => state.eq = Some(eq),
        Err(e) => state.errors.push(format!("EQ: {e}")),
    }
    session.close().await;
    state
}
async fn read_eq(session: &mut Session<'_>) -> Result<Eq, String> {
    let bytes = session.request(255, &[254, 1, 34], true).await?;
    parse_eq(&bytes)
}
fn parse_eq(bytes: &[u8]) -> Result<Eq, String> {
    if bytes.len() < 12
        || bytes.len() > 75
        || bytes[0] != 34
        || bytes[1] as usize + 2 != bytes.len()
        || (bytes.len() - 5) % 7 != 0
    {
        return Err("Resposta paramétrica não reconhecida".into());
    }
    let mut bands = Vec::new();
    for b in bytes[5..].chunks_exact(7) {
        let f = u16::from_le_bytes([b[0], b[1]]);
        if f < 20 || f > 20000 {
            return Err("Frequência fora da faixa".into());
        }
        bands.push((f, i16::from_le_bytes([b[2], b[3]]) as f64 / 100.));
    }
    bands.sort_by_key(|b| b.0);
    if bands.windows(2).any(|b| b[0].0 == b[1].0) {
        return Err("Frequência duplicada".into());
    }
    Ok(Eq {
        mode: bytes[2],
        frequencies: bands.iter().map(|b| b.0).collect(),
        gains: bands.iter().map(|b| b.1).collect(),
        raw: bytes.to_vec(),
    })
}
fn eq_payload(before: &Eq, gains: &[f64]) -> Result<Vec<u8>, String> {
    if gains.len() != before.frequencies.len()
        || gains
            .iter()
            .any(|v| !v.is_finite() || !(-12.0..=8.0).contains(v))
    {
        return Err("Ganhos devem ficar entre -12 e +8 dB".into());
    }
    let mut raw = before.raw.clone();
    parse_eq(&raw)?;
    raw[2] = 255;
    for b in raw[5..].chunks_exact_mut(7) {
        let f = u16::from_le_bytes([b[0], b[1]]);
        let i = before
            .frequencies
            .iter()
            .position(|v| *v == f)
            .ok_or("Frequência ausente")?;
        b[2..4].copy_from_slice(&((gains[i] * 100.).round() as i16).to_le_bytes());
    }
    Ok(raw)
}
#[derive(Serialize, Deserialize)]
pub struct Preset {
    pub id: u8,
    pub name: String,
    pub source: String,
    pub payload: Vec<u8>,
}
pub fn presets() -> Vec<Preset> {
    serde_json::from_str(include_str!("presets.json")).expect("Presets embarcados válidos")
}
pub async fn set_preset(p: &Peripheral, id: u8) -> Result<Controls, String> {
    let target = presets()
        .into_iter()
        .find(|v| v.id == id)
        .ok_or("Preset desconhecido")?;
    parse_eq(&target.payload)?;
    let mut session = Session::open(p).await?;
    let result = async {
        session.request(255, &target.payload, false).await?;
        let eq = read_eq(&mut session).await?;
        if eq.raw != target.payload {
            return Err("Preset não confirmado. Atualize a leitura.".into());
        }
        Ok(Controls {
            eq: Some(eq),
            ..Default::default()
        })
    }
    .await;
    session.close().await;
    result
}
async fn read_noise(session: &mut Session<'_>) -> Result<Noise, String> {
    let bytes = session.request(255, &[254, 1, 23], true).await?;
    if bytes.len() != 5 || bytes[0] != 23 || bytes[1] != 3 {
        return Err(format!("Resposta ANC não reconhecida {}", hex(&bytes)));
    }
    Ok(Noise {
        mode: bytes[2],
        scene: bytes[3],
        gain: bytes[4],
    })
}
fn validate_noise(n: &Noise) -> Result<(), String> {
    let valid = match (n.mode, n.scene, n.gain) {
        (1, 1..=3, 0..=2) | (1, 4..=5, 0) | (2, 0..=1, 0) | (3, 1, 4) => true,
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err("Cena ou nível ANC não suportado pelo N50".into())
    }
}
fn matches_noise(actual: &Noise, target: &Noise) -> bool {
    actual.mode == target.mode
        && match target.mode {
            1 => actual.scene == target.scene && (target.scene >= 4 || actual.gain == target.gain),
            2 => true,
            3 => actual.scene == target.scene && actual.gain == target.gain,
            _ => false,
        }
}
pub async fn set_noise(p: &Peripheral, mode: u8) -> Result<Controls, String> {
    let target = match mode {
        1 => Noise {
            mode: 1,
            scene: 1,
            gain: 2,
        },
        2 => Noise {
            mode: 2,
            scene: 0,
            gain: 0,
        },
        3 => Noise {
            mode: 3,
            scene: 1,
            gain: 4,
        },
        _ => return Err("Modo inválido".into()),
    };
    set_noise_config(p, target).await
}
pub async fn set_noise_config(p: &Peripheral, target: Noise) -> Result<Controls, String> {
    validate_noise(&target)?;
    static LAST: tokio::sync::Mutex<Option<std::time::Instant>> =
        tokio::sync::Mutex::const_new(None);
    let mut clock = LAST.lock().await;
    if let Some(last) = *clock {
        let elapsed = last.elapsed();
        if elapsed < std::time::Duration::from_millis(550) {
            tokio::time::sleep(std::time::Duration::from_millis(550) - elapsed).await;
        }
    }
    let mut session = Session::open(p).await?;
    *clock = Some(std::time::Instant::now());
    let result = async {
        session
            .request(255, &[23, 3, target.mode, target.scene, target.gain], false)
            .await?;
        for _ in 0..3 {
            tokio::time::sleep(std::time::Duration::from_millis(180)).await;
            let actual = read_noise(&mut session).await?;
            if matches_noise(&actual, &target) {
                return Ok(Controls {
                    noise: Some(actual),
                    ..Default::default()
                });
            }
        }
        Err("O fone ainda não confirmou cena e intensidade. Atualize a leitura.".into())
    }
    .await;
    session.close().await;
    result
}
pub async fn set_eq(p: &Peripheral, gains: Vec<f64>) -> Result<Controls, String> {
    let mut session = Session::open(p).await?;
    let result = async {
        let before = read_eq(&mut session).await?;
        let payload = eq_payload(&before, &gains)?;
        session.request(255, &payload, false).await?;
        let eq = read_eq(&mut session).await?;
        if eq.raw != payload {
            return Err("O fone não confirmou os ganhos. Atualize a leitura.".into());
        }
        Ok(Controls {
            eq: Some(eq),
            ..Default::default()
        })
    }
    .await;
    session.close().await;
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Vec<u8> {
        "22 49 7a cb f9 fa 00 58 02 96 00 ff 7d 00 f4 01 96 00 ff 40 00 90 01 78 00 ff 20 00 64 00 28 00 ff 80 3e 58 02 78 00 ff a0 0f 58 02 78 00 ff e8 03 bc 02 50 00 ff f4 01 f4 01 78 00 ff d0 07 bc 02 78 00 ff 40 1f bc 02 78 00 ff".split_whitespace().map(|v|u8::from_str_radix(v,16).unwrap()).collect()
    }
    #[test]
    fn validates_scene_levels_and_checks_gain() {
        let weak = Noise {
            mode: 1,
            scene: 2,
            gain: 0,
        };
        let strong = Noise {
            mode: 1,
            scene: 2,
            gain: 2,
        };
        assert!(validate_noise(&weak).is_ok());
        assert!(!matches_noise(&weak, &strong));
        assert!(validate_noise(&Noise {
            mode: 1,
            scene: 5,
            gain: 2
        })
        .is_err());
        assert!(matches_noise(
            &Noise {
                mode: 2,
                scene: 1,
                gain: 0
            },
            &Noise {
                mode: 2,
                scene: 0,
                gain: 0
            }
        ));
    }
    #[test]
    fn official_presets_decode_without_invented_bands() {
        for preset in presets() {
            let eq = parse_eq(&preset.payload).unwrap();
            assert!(eq.gains.len() == 4 || eq.gains.len() == 5 || preset.id == 20);
            let mut custom = preset.payload.clone();
            custom[2] = 255;
            assert_eq!(eq_payload(&eq, &eq.gains).unwrap(), custom);
        }
    }
    #[test]
    fn preserves_master_filters_and_original_band_order() {
        let raw = fixture();
        let eq = parse_eq(&raw).unwrap();
        assert_eq!(eq.gains, vec![1., 4., 5., 6., 5., 7., 7., 6., 7., 6.]);
        let output = eq_payload(&eq, &eq.gains).unwrap();
        let mut expected = raw.clone();
        expected[2] = 255;
        assert_eq!(output, expected);
        assert!(eq_payload(&eq, &[f64::NAN; 10]).is_err());
        assert!(parse_eq(&raw[..74]).is_err());
    }
}
