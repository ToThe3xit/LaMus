use serenity::model::id::GuildId;
use serenity::async_trait;
use std::sync::Arc;
use tokio::sync::Mutex;

use musicbot_core::event::Event;
use musicbot_core::engine::CoreState;
use musicbot_audio_lavalink::LavalinkBackend;

// ============================================================ //
// ==== AUDIO ADAPTER INTERFACE =============================== //
// ============================================================ //
#[async_trait]
pub trait AudioAdapter: Send + Sync {
    async fn handle_event(&mut self, guild_id: GuildId, event: &Event);
}

pub struct DiscordAudioAdapter {
    pub core: Arc<Mutex<CoreState>>,
    pub backend: LavalinkBackend,
}

impl DiscordAudioAdapter {
    pub fn new(core: Arc<Mutex<CoreState>>, backend: LavalinkBackend) -> Self {
        Self { core, backend }
    }
}

// ============================================================ //
// ==== ADAPTER IMPLEMENTATION (LAVALINK) ===================== //
// ============================================================ //
#[async_trait]
impl AudioAdapter for DiscordAudioAdapter {
    async fn handle_event(&mut self,guild_id: GuildId, event: &Event) {
        match event {
            Event::PlaybackStarted { track_id, .. } => {
                let core = self.core.lock().await;
                let track_opt = core.queue.current_track().cloned();
                drop(core);

                if let Some(track) = track_opt {
                    if track.id == *track_id {
                        if let Some(track_json) = track.lavalink_id {
                            println!("[ADAPTER] Playback command dispatched: {}", track.title);
                            self.backend.play(guild_id, &track_json).await;
                        }
                    }
                }
            }
            Event::PlaybackPaused { .. } => {
                println!("[ADAPTER] Stream playback paused");
                self.backend.pause(guild_id).await;
            }
            Event::PlaybackResumed => {
                println!("[ADAPTER] Stream playback resumed");
                self.backend.resume(guild_id).await;
            }
            Event::PlaybackPositionReset => {
            }
            Event::PlaybackSeeked { seconds } => {
                println!("[ADAPTER] Playback position changed: {}s", seconds);
                self.backend.seek(guild_id, seconds * 1000).await;
            }
            Event::VolumeChanged { volume } => {
                println!("[ADAPTER] Volume modified: {}%", volume);
                self.backend.set_volume(guild_id, *volume).await;
            }
            Event::PlaybackStopped => {
                println!("[ADAPTER] Stream stopped (audio tunnel maintained)");
                self.backend.stop(guild_id).await;
            }
            _ => {}
        }
    }
}