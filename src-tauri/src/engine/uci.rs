use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use serde::{Deserialize, Serialize};
use crate::error::OropisError;
use tracing::{error, debug};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EngineCommand {
    Uci,
    IsReady,
    UciNewGame,
    Position { fen: String, moves: Vec<String> },
    Go { depth: Option<u32>, movetime: Option<u32>, infinite: bool },
    Stop,
    Quit,
    SetOption { name: String, value: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Score {
    Cp(i32),
    Mate(i32),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum EngineOutput {
    Id { name: String, author: String },
    UciOk,
    ReadyOk,
    BestMove { best_move: String, ponder: Option<String> },
    Info {
        depth: Option<u32>,
        seldepth: Option<u32>,
        multipv: Option<u32>,
        score: Option<Score>,
        nodes: Option<u64>,
        nps: Option<u64>,
        hashfull: Option<u32>,
        tbhits: Option<u64>,
        time: Option<u64>,
        pv: Option<Vec<String>>,
    },
}

pub struct UciEngine {
    child: Child,
    tx: mpsc::UnboundedSender<String>,
}

impl UciEngine {
    pub async fn new(config: EngineConfig) -> Result<(Self, mpsc::UnboundedReceiver<EngineOutput>), OropisError> {
        let mut child = Command::new(&config.path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| OropisError::EngineNotFound(format!("{}: {}", config.path, e)))?;

        let stdin = child.stdin.take().ok_or_else(|| OropisError::IoError("Failed to open stdin".into()))?;
        let stdout = child.stdout.take().ok_or_else(|| OropisError::IoError("Failed to open stdout".into()))?;

        let (in_tx, mut in_rx) = mpsc::unbounded_channel::<String>();
        let (out_tx, out_rx) = mpsc::unbounded_channel::<EngineOutput>();

        // Handle Stdin
        tokio::spawn(async move {
            let mut writer = stdin;
            while let Some(cmd) = in_rx.recv().await {
                debug!("UCI In: {}", cmd);
                if let Err(e) = writer.write_all(format!("{}\n", cmd).as_bytes()).await {
                    error!("Failed to write to engine stdin: {}", e);
                    break;
                }
                if let Err(e) = writer.flush().await {
                    error!("Failed to flush engine stdin: {}", e);
                    break;
                }
            }
        });

        // Handle Stdout
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                debug!("UCI Out: {}", line);
                if let Some(output) = parse_uci_line(&line) {
                    if out_tx.send(output).is_err() {
                        break;
                    }
                }
            }
        });

        Ok((Self { child, tx: in_tx }, out_rx))
    }

    pub fn send(&self, cmd: EngineCommand) -> Result<(), OropisError> {
        let cmd_str = match cmd {
            EngineCommand::Uci => "uci".to_string(),
            EngineCommand::IsReady => "isready".to_string(),
            EngineCommand::UciNewGame => "ucinewgame".to_string(),
            EngineCommand::Position { fen, moves } => {
                let mut s = format!("position fen {}", fen);
                if !moves.is_empty() {
                    s.push_str(" moves ");
                    s.push_str(&moves.join(" "));
                }
                s
            }
            EngineCommand::Go { depth, movetime, infinite } => {
                let mut s = "go".to_string();
                if infinite {
                    s.push_str(" infinite");
                } else {
                    if let Some(d) = depth { s.push_str(&format!(" depth {}", d)); }
                    if let Some(t) = movetime { s.push_str(&format!(" movetime {}", t)); }
                }
                s
            }
            EngineCommand::Stop => "stop".to_string(),
            EngineCommand::Quit => "quit".to_string(),
            EngineCommand::SetOption { name, value } => format!("setoption name {} value {}", name, value),
        };

        self.tx.send(cmd_str).map_err(|_| OropisError::ChannelClosed)
    }
}

fn parse_uci_line(line: &str) -> Option<EngineOutput> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.is_empty() { return None; }

    match parts[0] {
        "id" if parts.len() >= 3 => {
            match parts[1] {
                "name" => Some(EngineOutput::Id { name: parts[2..].join(" "), author: "".to_string() }),
                "author" => Some(EngineOutput::Id { name: "".to_string(), author: parts[2..].join(" ") }),
                _ => None
            }
        }
        "uciok" => Some(EngineOutput::UciOk),
        "readyok" => Some(EngineOutput::ReadyOk),
        "bestmove" if parts.len() >= 2 => {
            let ponder = if parts.len() >= 4 && parts[2] == "ponder" {
                Some(parts[3].to_string())
            } else {
                None
            };
            Some(EngineOutput::BestMove { best_move: parts[1].to_string(), ponder })
        }
        "info" => {
            let mut info = EngineOutput::Info {
                depth: None, seldepth: None, multipv: None, score: None,
                nodes: None, nps: None, hashfull: None, tbhits: None,
                time: None, pv: None,
            };
            
            if let EngineOutput::Info {
                depth, seldepth, multipv, score, nodes, nps, hashfull, tbhits, time, pv
            } = &mut info {
                let mut i = 1;
                while i < parts.len() {
                    match parts[i] {
                        "depth" if i + 1 < parts.len() => { *depth = parts[i+1].parse().ok(); i += 2; }
                        "seldepth" if i + 1 < parts.len() => { *seldepth = parts[i+1].parse().ok(); i += 2; }
                        "multipv" if i + 1 < parts.len() => { *multipv = parts[i+1].parse().ok(); i += 2; }
                        "nodes" if i + 1 < parts.len() => { *nodes = parts[i+1].parse().ok(); i += 2; }
                        "nps" if i + 1 < parts.len() => { *nps = parts[i+1].parse().ok(); i += 2; }
                        "hashfull" if i + 1 < parts.len() => { *hashfull = parts[i+1].parse().ok(); i += 2; }
                        "tbhits" if i + 1 < parts.len() => { *tbhits = parts[i+1].parse().ok(); i += 2; }
                        "time" if i + 1 < parts.len() => { *time = parts[i+1].parse().ok(); i += 2; }
                        "score" if i + 2 < parts.len() => {
                            let raw_type = parts[i+1];
                            let raw_val = parts[i+2];
                            *score = raw_val.parse::<i32>().ok().map(|v| {
                                if raw_type == "cp" {
                                    Score::Cp(v)
                                } else {
                                    Score::Mate(v)
                                }
                            });
                            i += 3;
                        }
                        "pv" => {
                            *pv = Some(parts[i+1..].iter().map(|s| s.to_string()).collect());
                            break;
                        }
                        _ => i += 1,
                    }
                }
            }
            Some(info)
        }
        _ => None,
    }
}
