use crate::rcsp::{self, Battery, Decoder};
use btleplug::{
    api::{CharPropFlags, Characteristic, Peripheral as _, ValueNotification, WriteType},
    platform::Peripheral,
};
use futures_util::{stream::BoxStream, StreamExt};
use serde::Serialize;
use std::{
    future::Future,
    sync::atomic::{AtomicU8, Ordering},
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::time::timeout;
use uuid::Uuid;
static SEQUENCE: OnceLock<AtomicU8> = OnceLock::new();
fn next_sequence() -> u8 {
    SEQUENCE
        .get_or_init(|| {
            // Protocol identifier, not a security token. Avoid restarting every process at 0x40.
            let seed = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos() as u8
                ^ std::process::id() as u8;
            AtomicU8::new(seed)
        })
        .fetch_add(1, Ordering::Relaxed)
}
const SERVICE: Uuid = Uuid::from_u128(0x0000a002_0000_1000_8000_00805f9b34fb);
const WRITE: Uuid = Uuid::from_u128(0x00000001_0000_1000_8000_00805f9b34fb);
const NOTIFY: Uuid = Uuid::from_u128(0x00000002_0000_1000_8000_00805f9b34fb);
#[derive(Debug, Serialize)]
pub struct QueryResult {
    pub battery: Option<Battery>,
    pub error: Option<String>,
    pub trace: Vec<String>,
}
fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

async fn exchange_battery<Send, SendFuture, Next>(
    mut send: Send,
    stream: &mut BoxStream<'_, ValueNotification>,
    trace: &mut Vec<String>,
    mut sequence: Next,
    response_timeout: Duration,
) -> Result<Battery, String>
where
    Send: FnMut(Vec<u8>) -> SendFuture,
    SendFuture: Future<Output = Result<(), String>>,
    Next: FnMut() -> u8,
{
    for attempt in 0..2 {
        let sn = sequence();
        let frame = rcsp::command(0xc1, sn, &3361u32.to_be_bytes())?;
        trace.push(format!("TX {}", hex(&frame)));
        send(frame).await?;
        let response = async {
            let mut decoder = Decoder::default();
            while let Some(notification) = stream.next().await {
                if notification.uuid != NOTIFY {
                    continue;
                }
                if trace.len() < 64 {
                    trace.push(format!("RX {}", hex(&notification.value)));
                }
                for packet in decoder.feed(&notification.value) {
                    if let Some(response) = packet.response(0xc1, sn) {
                        return rcsp::adv_battery(response?);
                    }
                }
            }
            Err("Fluxo de notificações Bluetooth encerrado".into())
        };
        match timeout(response_timeout, response).await {
            Ok(result) => return result, // Status/parser/stream failures must not trigger retries.
            Err(_) if attempt == 0 => {
                trace.push("Sem resposta; nova tentativa com outra sequência".into())
            }
            Err(_) => {
                return Err(
                    "O N50 não respondeu após duas consultas RCSP. Tente atualizar a leitura."
                        .into(),
                )
            }
        }
    }
    unreachable!()
}
async fn read_battery(
    peripheral: &Peripheral,
    write: &Characteristic,
    stream: &mut BoxStream<'_, ValueNotification>,
    trace: &mut Vec<String>,
) -> Result<Battery, String> {
    exchange_battery(
        |frame| async move {
            timeout(
                Duration::from_secs(2),
                peripheral.write(write, &frame, WriteType::WithoutResponse),
            )
            .await
            .map_err(|_| "Tempo esgotado ao enviar consulta RCSP")?
            .map_err(|e| format!("Falha ao enviar consulta RCSP: {e}"))
        },
        stream,
        trace,
        next_sequence,
        Duration::from_secs(5),
    )
    .await
}
/// Only called after matching the N50 vendor id 0x477a. Never sends setting/OTA commands.
pub async fn query_battery(peripheral: &Peripheral) -> QueryResult {
    let mut trace = Vec::new();
    let chars = peripheral.characteristics();
    let write = chars.iter().find(|c| {
        c.service_uuid == SERVICE
            && c.uuid == WRITE
            && c.properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE)
    });
    let notify = chars.iter().find(|c| {
        c.service_uuid == SERVICE
            && c.uuid == NOTIFY
            && c.properties.contains(CharPropFlags::NOTIFY)
    });
    let (Some(write), Some(notify)) = (write, notify) else {
        return QueryResult {
            battery: None,
            error: Some("O canal RCSP esperado do N50 não está disponível".into()),
            trace,
        };
    };
    let mut stream = match timeout(Duration::from_secs(2), peripheral.notifications()).await {
        Ok(Ok(stream)) => stream,
        Ok(Err(error)) => {
            return QueryResult {
                battery: None,
                error: Some(format!("Falha ao abrir notificações RCSP: {error}")),
                trace,
            }
        }
        Err(_) => {
            return QueryResult {
                battery: None,
                error: Some("Tempo esgotado ao abrir notificações RCSP".into()),
                trace,
            }
        }
    };
    match timeout(Duration::from_secs(2), peripheral.subscribe(notify)).await {
        Ok(Ok(())) => (),
        _ => {
            return QueryResult {
                battery: None,
                error: Some("Não foi possível assinar notificações RCSP".into()),
                trace,
            }
        }
    }
    let result = read_battery(peripheral, write, &mut stream, &mut trace).await;
    match timeout(Duration::from_secs(2), peripheral.unsubscribe(notify)).await {
        Ok(Ok(())) => (),
        _ => trace.push("Aviso: não foi possível encerrar a assinatura de notificações".into()),
    }
    match result {
        Ok(battery) => QueryResult {
            battery: Some(battery),
            error: None,
            trace,
        },
        Err(error) => QueryResult {
            battery: None,
            error: Some(error),
            trace,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{atomic::AtomicUsize, Arc};
    use tokio::sync::mpsc;
    fn response(sequence: u8, status: u8) -> ValueNotification {
        ValueNotification {
            uuid: NOTIFY,
            value: vec![
                0xfe, 0xdc, 0xba, 0, 0xc1, 0, 6, status, sequence, 3, 0, 100, 100, 0xef,
            ],
        }
    }
    fn stream(
        receiver: mpsc::UnboundedReceiver<ValueNotification>,
    ) -> BoxStream<'static, ValueNotification> {
        Box::pin(futures_util::stream::unfold(
            receiver,
            |mut rx| async move { rx.recv().await.map(|n| (n, rx)) },
        ))
    }
    #[test]
    fn duplicate_sequence_timeout_recovers_and_ignores_late_response() {
        tauri::async_runtime::block_on(async {
            let (sender, receiver) = mpsc::unbounded_channel();
            let count = Arc::new(AtomicUsize::new(0));
            let observed = count.clone();
            let mut seq = 0x40u8;
            let mut trace = Vec::new();
            let battery = exchange_battery(
                |frame| {
                    let sender = sender.clone();
                    let count = count.clone();
                    async move {
                        if count.fetch_add(1, Ordering::Relaxed) == 1 {
                            sender.send(response(0x40, 0)).unwrap(); // Late first response must be ignored.
                            sender.send(response(frame[7], 0)).unwrap();
                        }
                        Ok(())
                    }
                },
                &mut stream(receiver),
                &mut trace,
                || {
                    let n = seq;
                    seq = seq.wrapping_add(1);
                    n
                },
                Duration::from_millis(5),
            )
            .await
            .unwrap();
            assert_eq!(observed.load(Ordering::Relaxed), 2);
            assert_eq!((battery.left, battery.right), (Some(100), Some(100)));
            assert!(trace
                .iter()
                .any(|line| line.starts_with("TX fe dc ba c0 c1 00 05 41")));
        });
    }
    #[test]
    fn protocol_rejection_is_not_retried() {
        tauri::async_runtime::block_on(async {
            let (sender, receiver) = mpsc::unbounded_channel();
            let count = Arc::new(AtomicUsize::new(0));
            let observed = count.clone();
            let result = exchange_battery(
                |frame| {
                    let sender = sender.clone();
                    let count = count.clone();
                    async move {
                        count.fetch_add(1, Ordering::Relaxed);
                        sender.send(response(frame[7], 2)).unwrap();
                        Ok(())
                    }
                },
                &mut stream(receiver),
                &mut Vec::new(),
                || 9,
                Duration::from_millis(5),
            )
            .await;
            assert!(result.unwrap_err().contains("status 2"));
            assert_eq!(observed.load(Ordering::Relaxed), 1);
        });
    }
    #[test]
    fn missing_device_stops_after_two_attempts() {
        tauri::async_runtime::block_on(async {
            let (_sender, receiver) = mpsc::unbounded_channel();
            let mut count = 0;
            let result = exchange_battery(
                |_| {
                    count += 1;
                    std::future::ready(Ok(()))
                },
                &mut stream(receiver),
                &mut Vec::new(),
                next_sequence,
                Duration::from_millis(5),
            )
            .await;
            assert!(result.unwrap_err().contains("duas consultas"));
            assert_eq!(count, 2);
        });
    }
}

/// One notification subscription per operation; requests remain serialized.
pub struct Session<'a> {
    peripheral: &'a Peripheral,
    write: Characteristic,
    notify: Characteristic,
    stream: BoxStream<'static, ValueNotification>,
}
impl<'a> Session<'a> {
    pub async fn open(peripheral: &'a Peripheral) -> Result<Self, String> {
        let chars = peripheral.characteristics();
        let write = chars
            .iter()
            .find(|c| c.service_uuid == SERVICE && c.uuid == WRITE)
            .cloned()
            .ok_or("Canal de escrita indisponível")?;
        let notify = chars
            .iter()
            .find(|c| c.service_uuid == SERVICE && c.uuid == NOTIFY)
            .cloned()
            .ok_or("Notificações indisponíveis")?;
        let stream = peripheral
            .notifications()
            .await
            .map_err(|e| e.to_string())?;
        timeout(Duration::from_secs(2), peripheral.subscribe(&notify))
            .await
            .map_err(|_| "Timeout de assinatura")?
            .map_err(|e| e.to_string())?;
        Ok(Self {
            peripheral,
            write,
            notify,
            stream,
        })
    }
    pub async fn request(
        &mut self,
        opcode: u8,
        payload: &[u8],
        is_read: bool,
    ) -> Result<Vec<u8>, String> {
        let operation = async {
            for attempt in 0..if is_read { 2 } else { 1 } {
                let sn = next_sequence();
                let frame = rcsp::command(opcode, sn, payload)?;
                self.peripheral
                    .write(&self.write, &frame, WriteType::WithoutResponse)
                    .await
                    .map_err(|e| e.to_string())?;
                let receive = async {
                    let mut decoder = Decoder::default();
                    while let Some(n) = self.stream.next().await {
                        if n.uuid != NOTIFY {
                            continue;
                        }
                        for packet in decoder.feed(&n.value) {
                            if let Some(response) = packet.response(opcode, sn) {
                                return response.map(|v| v.to_vec());
                            }
                        }
                    }
                    Err("Conexão encerrada".into())
                };
                match timeout(Duration::from_secs(4), receive).await {
                    Ok(r) => return r,
                    Err(_) if is_read && attempt == 0 => continue,
                    Err(_) => {
                        return Err(
                            "O fone não confirmou a operação. Atualize para verificar.".into()
                        )
                    }
                }
            }
            unreachable!()
        };
        timeout(Duration::from_secs(12), operation)
            .await
            .map_err(|_| "Tempo esgotado na operação RCSP".to_string())
            .and_then(|r| r)
    }
    pub async fn close(self) {
        let _ = timeout(
            Duration::from_secs(2),
            self.peripheral.unsubscribe(&self.notify),
        )
        .await;
    }
}
pub async fn transact(
    p: &Peripheral,
    opcode: u8,
    payload: &[u8],
    is_read: bool,
) -> Result<Vec<u8>, String> {
    let mut session = Session::open(p).await?;
    let result = session.request(opcode, payload, is_read).await;
    session.close().await;
    result
}
