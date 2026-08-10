use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};
use crate::error::HyperCroissantError;
use crate::engine::uci::{UciEngine, EngineCommand, EngineConfig};
use tracing::error;

pub struct EngineManager {
    engine: Arc<Mutex<Option<UciEngine>>>,
}

impl EngineManager {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(
        &self,
        config: EngineConfig,
        app_handle: AppHandle,
    ) -> Result<(), HyperCroissantError> {
        let mut engine_lock = self.engine.lock().await;
        if engine_lock.is_some() {
            return Err(HyperCroissantError::EngineAlreadyRunning);
        }

        let (engine, mut rx) = UciEngine::new(config).await?;
        // Bring the engine into UCI mode before option/position commands.
        engine.send(EngineCommand::Uci)?;
        engine.send(EngineCommand::IsReady)?;
        *engine_lock = Some(engine);

        // Spawn output listener
        tokio::spawn(async move {
            while let Some(output) = rx.recv().await {
                if let Err(e) = app_handle.emit("engine-output", output) {
                    error!("Failed to emit engine output: {}", e);
                }
            }
        });

        Ok(())
    }

    pub async fn stop(&self) -> Result<(), HyperCroissantError> {
        let mut engine_lock = self.engine.lock().await;
        if let Some(engine) = engine_lock.take() {
            engine.send(EngineCommand::Quit)?;
        }
        Ok(())
    }

    pub async fn send_command(&self, cmd: EngineCommand) -> Result<(), HyperCroissantError> {
        let engine_lock = self.engine.lock().await;
        if let Some(engine) = engine_lock.as_ref() {
            engine.send(cmd)?;
            Ok(())
        } else {
            Err(HyperCroissantError::EngineNotRunning)
        }
    }
}
