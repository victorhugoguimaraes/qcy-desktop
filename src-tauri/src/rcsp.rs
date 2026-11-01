//! JieLi RCSP framing recovered from the QCY 4.0.7 APK. No setting writes.
use serde::Serialize;
const PREFIX: &[u8] = &[0xfe, 0xdc, 0xba];
const MAX_BODY: usize = 4096;

#[derive(Debug, PartialEq)]
pub struct Packet {
    pub flags: u8,
    pub opcode: u8,
    pub body: Vec<u8>,
}
impl Packet {
    pub fn response(&self, opcode: u8, sequence: u8) -> Option<Result<&[u8], String>> {
        if self.flags & 0x80 != 0
            || self.opcode != opcode
            || self.body.len() < 2
            || self.body[1] != sequence
        {
            return None;
        }
        Some(if self.body[0] == 0 {
            Ok(&self.body[2..])
        } else {
            Err(format!(
                "RCSP retornou status {} para opcode {opcode:02x}",
                self.body[0]
            ))
        })
    }
}
pub fn command(opcode: u8, sequence: u8, payload: &[u8]) -> Result<Vec<u8>, String> {
    if payload.len() >= MAX_BODY {
        return Err("Comando RCSP grande demais".into());
    }
    let mut frame = Vec::with_capacity(payload.len() + 9);
    frame.extend_from_slice(PREFIX);
    frame.extend_from_slice(&[0xc0, opcode]);
    frame.extend_from_slice(&((payload.len() + 1) as u16).to_be_bytes());
    frame.push(sequence);
    frame.extend_from_slice(payload);
    frame.push(0xef);
    Ok(frame)
}
#[derive(Default)]
pub struct Decoder {
    buffer: Vec<u8>,
}
impl Decoder {
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<Packet> {
        let mut packets = Vec::new();
        // BLE fragments are small; bound retained input even for corrupt streams.
        for chunk in bytes.chunks(MAX_BODY) {
            self.buffer.extend_from_slice(chunk);
            loop {
                let Some(start) = self.buffer.windows(3).position(|w| w == PREFIX) else {
                    if self.buffer.len() > 2 {
                        self.buffer.drain(..self.buffer.len() - 2);
                    }
                    break;
                };
                if start > 0 {
                    self.buffer.drain(..start);
                }
                if self.buffer.len() < 7 {
                    break;
                }
                let len = u16::from_be_bytes([self.buffer[5], self.buffer[6]]) as usize;
                if len == 0 || len > MAX_BODY {
                    self.buffer.drain(..1);
                    continue;
                }
                let total = len + 8;
                if self.buffer.len() < total {
                    break;
                }
                if self.buffer[total - 1] != 0xef {
                    self.buffer.drain(..1);
                    continue;
                }
                packets.push(Packet {
                    flags: self.buffer[3],
                    opcode: self.buffer[4],
                    body: self.buffer[7..total - 1].to_vec(),
                });
                self.buffer.drain(..total);
            }
        }
        packets
    }
}
#[derive(Debug, Serialize, PartialEq)]
pub struct Battery {
    pub left: Option<u8>,
    pub right: Option<u8>,
    pub case: Option<u8>,
    pub charging: [bool; 3],
}
/// ADVInfo is a list of [length including type, type, value...]. Type 0 is battery.
pub fn adv_battery(payload: &[u8]) -> Result<Battery, String> {
    let mut offset = 0;
    let mut battery = None;
    while offset < payload.len() {
        let length = payload[offset] as usize;
        if length < 1 || offset + length + 1 > payload.len() {
            return Err("Resposta ADVInfo truncada ou inválida".into());
        }
        let kind = payload[offset + 1];
        let value = &payload[offset + 2..offset + length + 1];
        if kind == 0 {
            if value.is_empty() || value.len() > 3 {
                return Err("Campo de bateria com tamanho inválido".into());
            }
            let level = |i: usize| {
                value.get(i).and_then(|b| {
                    let v = b & 0x7f;
                    if v <= 100 {
                        Some(v)
                    } else {
                        None
                    }
                })
            };
            battery = Some(Battery {
                left: level(0),
                right: level(1),
                case: level(2),
                charging: [0, 1, 2].map(|i| value.get(i).is_some_and(|b| b & 0x80 != 0)),
            });
        }
        offset += length + 1;
    }
    battery.ok_or_else(|| "Resposta RCSP sem campo de bateria".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn query_bytes_match_apk_framing() {
        assert_eq!(
            command(0xc1, 7, &3361u32.to_be_bytes()).unwrap(),
            [0xfe, 0xdc, 0xba, 0xc0, 0xc1, 0, 5, 7, 0, 0, 0x0d, 0x21, 0xef]
        );
    }
    #[test]
    fn reconstructs_every_fragment_boundary_and_multiple_packets() {
        let bytes = [
            0xfe,
            0xdc,
            0xba,
            0,
            0xc1,
            0,
            6,
            0,
            7,
            3,
            0,
            0x80 | 42,
            100,
            0xef,
        ];
        for split in 0..=bytes.len() {
            let mut decoder = Decoder::default();
            let mut packets = decoder.feed(&bytes[..split]);
            packets.extend(decoder.feed(&bytes[split..]));
            assert_eq!(packets.len(), 1);
            assert_eq!(
                packets[0].response(0xc1, 7).unwrap().unwrap(),
                [3, 0, 0x80 | 42, 100]
            );
            let battery = adv_battery(packets[0].response(0xc1, 7).unwrap().unwrap()).unwrap();
            assert_eq!(
                (battery.left, battery.right, battery.case),
                (Some(42), Some(100), None)
            );
            assert_eq!(battery.charging, [true, false, false]);
        }
        let mut d = Decoder::default();
        let mut doubled = bytes.to_vec();
        doubled.extend(bytes);
        assert_eq!(d.feed(&doubled).len(), 2);
    }
    #[test]
    fn parses_real_n50_response_from_linux() {
        // Captured 2026-11-01: response to GetADVInfo(mask=3361), sequence 0x40.
        let bytes = [
            0xfe, 0xdc, 0xba, 0x00, 0xc1, 0x00, 0x0d, 0x00, 0x40, 0x02, 0x0a, 0x02, 0x02, 0x05,
            0x01, 0x04, 0x00, 0x64, 0x64, 0x00, 0xef,
        ];
        let mut decoder = Decoder::default();
        let packets = decoder.feed(&bytes);
        assert_eq!(packets.len(), 1);
        let battery = adv_battery(packets[0].response(0xc1, 0x40).unwrap().unwrap()).unwrap();
        assert_eq!(
            battery,
            Battery {
                left: Some(100),
                right: Some(100),
                case: Some(0),
                charging: [false, false, false]
            }
        );
        let mut malformed = packets[0].body.clone();
        malformed.extend_from_slice(&[4, 0, 1]);
        assert!(adv_battery(&malformed[2..]).is_err());
    }
    #[test]
    fn ignores_unrelated_and_failed_responses() {
        let p = Packet {
            flags: 0,
            opcode: 0xc1,
            body: vec![2, 7],
        };
        assert!(p.response(0xc1, 8).is_none());
        assert!(p.response(0xc1, 7).unwrap().is_err());
        assert!(Packet { flags: 0x80, ..p }.response(0xc1, 7).is_none());
    }
    #[test]
    fn rejects_truncated_tlvs_and_recovers_after_noise() {
        assert!(adv_battery(&[4, 0, 10]).is_err());
        assert!(adv_battery(&[0]).is_err());
        assert!(adv_battery(&[2, 1, 3]).is_err());
        assert!(adv_battery(&[2, 0, 127]).unwrap().left.is_none());
        let mut d = Decoder::default();
        assert!(d.feed(&[0xfe, 0xdc, 0xba, 0, 1, 0xff, 0xff]).is_empty());
        assert_eq!(d.feed(&command(1, 1, &[]).unwrap()).len(), 1);
    }
}
