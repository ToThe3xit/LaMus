use serenity::prelude::*;
use serenity::model::id::GuildId;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::adapter::{AudioAdapter, DiscordAudioAdapter};

use musicbot_core::engine::CoreState;
use musicbot_core::command::Command;
use musicbot_core::track::Track;
use musicbot_core::event::Event as CoreEvent;

pub use musicbot_audio_lavalink::resolve_tracks;

// ============================================================ //
// ==== OBSERVER INTERACTION ROUTER (SLASH COMMANDS) ========== //
// ============================================================ //
pub async fn handle_interaction(
    ctx: &Context,
    interaction: &serenity::all::CommandInteraction,
    hivemind: &Arc<musicbot_core::hivemind::HiveMind>,
    obs_tx: &tokio::sync::mpsc::UnboundedSender<crate::discord::ObserverMessage>,
    bot_count: usize,
) {
    let _ = interaction.defer(&ctx.http).await;

    let user_id = interaction.user.id.get();
    let guild_id = match interaction.guild_id {
        Some(id) => id,
        None => return,
    };

    let user_voice = hivemind.get_user_channel(user_id).await;
    let (u_guild, u_chan) = match user_voice {
        Some(vc) if vc.0 == guild_id.get() => vc,
        _ => {
            let _ = interaction.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().content("[ERROR] You must be in a voice channel!")).await;
            return;
        }
    };

    let busy_bots = hivemind.get_all_busy_bots().await;
    let mut target_bot_index = None;

    if let Some((b_idx, _, _)) = busy_bots.iter().find(|(_, g, c)| *g == u_guild && *c == u_chan) {
        target_bot_index = Some(*b_idx);
    }

    if target_bot_index.is_none() {
        let bots_guard = hivemind.bots.read().await;
        for i in 0..bot_count {
            if let Some(bot) = bots_guard.get(&i) {
                let is_on_server = bot.guilds.contains(&u_guild);
                let is_idle = bot.state == musicbot_core::hivemind::BotState::Idle;
                if is_on_server && is_idle {
                    target_bot_index = Some(i);
                    break;
                }
            }
        }
    }

    let bot_index = match target_bot_index {
        Some(idx) => idx,
        None => {
            let _ = interaction.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().content("[ERROR] All bots are currently busy.")).await;
            return;
        }
    };

    let t_chan = interaction.channel_id.get();

    match interaction.data.name.as_str() {
        "search" => {
            let query = if let Some(serenity::all::CommandDataOptionValue::String(s)) = interaction.data.options.get(0).map(|o| &o.value) { s.clone() } else { return; };
            let _ = obs_tx.send(crate::discord::ObserverMessage::Search { guild_id: u_guild, voice_channel_id: u_chan, text_channel_id: t_chan, bot_index, query: query.clone() });
            let msg = format!("[INFO] Located you! Delegating network search `{}` to Bot #{}", query, bot_index);
            let _ = interaction.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().content(msg)).await;
        },
        "searchlocal" => {
            let query = if let Some(serenity::all::CommandDataOptionValue::String(s)) = interaction.data.options.get(0).map(|o| &o.value) { s.clone() } else { return; };
            let _ = obs_tx.send(crate::discord::ObserverMessage::SearchLocal { guild_id: u_guild, voice_channel_id: u_chan, text_channel_id: t_chan, bot_index, query: query.clone() });
            let msg = format!("[INFO] Located you! Delegating local search `{}` to Bot #{}", query, bot_index);
            let _ = interaction.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().content(msg)).await;
        },
        action @ ("skip" | "leave" | "pause" | "resume" | "clear") => {
            let _ = obs_tx.send(crate::discord::ObserverMessage::Action { guild_id: u_guild, text_channel_id: t_chan, bot_index, action: action.to_string() });
            let msg = format!("[INFO] Delegating command `{}` to Bot #{}", action.to_uppercase(), bot_index);
            let _ = interaction.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().content(msg)).await;
        },
        "queue" => {
            let _ = interaction.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().content("[INFO] Observer cannot see the audio queue. Open the WebUI panel to manage the live playlist!")).await;
        },
        _ => {
            let _ = interaction.edit_response(&ctx.http, serenity::all::EditInteractionResponse::new().content("[INFO] Command not supported in this panel.")).await;
        }
    }
}

// ============================================================ //
// ==== CORE EVENT ADAPTER (CORE -> AUDIO) ==================== //
// ============================================================ //
pub async fn process_core_events(
    guild_id: GuildId,
    events: Vec<CoreEvent>,
    audio: Arc<Mutex<DiscordAudioAdapter>>,
) {
    let mut audio_lock = audio.lock().await;
    for event in events {
        audio_lock.handle_event(guild_id, &event).await;
    }
}

pub async fn add_track_and_autoplay_bg(
    guild_id: GuildId,
    track: Track,
    core: Arc<Mutex<CoreState>>,
    audio: Arc<Mutex<DiscordAudioAdapter>>,
) {
    let events = {
        let mut core_lock = core.lock().await;
        core_lock.handle_command(Command::AddTrack { track })
    };
    process_core_events(guild_id, events, audio.clone()).await;

    let should_play = {
        let core_lock = core.lock().await;
        core_lock.playback.mode == musicbot_core::playback::PlaybackMode::Stopped
    };

    if should_play {
        let play_events = {
            let mut core_lock = core.lock().await;
            core_lock.handle_command(Command::Play)
        };
        process_core_events(guild_id, play_events, audio.clone()).await;
    }
}

// ============================================================ //
// ==== AUTO-PLAY SYSTEM (SMART RADIO) ======================== //
// ============================================================ //
pub async fn trigger_radio(
    guild_id: GuildId,
    source: musicbot_core::event::RadioSource,
    core: Arc<Mutex<CoreState>>,
    audio: Arc<Mutex<DiscordAudioAdapter>>,
    db: Arc<crate::db_runtime::DbRuntime>,
    tracks_preview: Arc<crate::search::TracksPreview>,
    lavalink_password: Arc<String>,
    local_tracks_dir: Arc<String>,
    docker_tracks_dir: Arc<String>,
) {
    println!("[RADIO] Initializing Auto-Radio algorithm (Source: {:?})", source);
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_micros() as usize;

    match source {
        musicbot_core::event::RadioSource::Local => {
            let tracks_len = tracks_preview.tracks.len();
            if tracks_len > 0 {
                let random_idx = time % tracks_len;
                let local_track = &tracks_preview.tracks[random_idx];

                let (file_path, _) = db.get(&local_track.id)
                    .map(|(p, d)| (p.to_string_lossy().to_string(), *d))
                    .unwrap_or_else(|| ("".to_string(), 0));

                let docker_path = file_path.replace(
                    local_tracks_dir.as_str(),
                    docker_tracks_dir.as_str(),
                );

                if let Some(mut lavalink_tracks) = resolve_tracks(&docker_path, &lavalink_password).await {
                    if !lavalink_tracks.is_empty() {
                        let mut track = lavalink_tracks.remove(0);
                        track.title = local_track.title.clone();
                        println!("[RADIO] Local radio queuing: {}", track.title);
                        add_track_and_autoplay_bg(guild_id, track, core, audio).await;
                    }
                }
            }
        }

        musicbot_core::event::RadioSource::Network => {
            let last_track_json = {
                let c = core.lock().await;
                c.queue.current_track()
                    .and_then(|t| t.lavalink_id.clone())
                    .or_else(|| {
                        c.history.iter().rev()
                            .find(|t| t.lavalink_id.is_some())
                            .and_then(|t| t.lavalink_id.clone())
                    })
            };

            let mut used_recommendation = false;

            if let Some(ref track_json) = last_track_json {
                if let Some(video_id) = musicbot_audio_lavalink::extract_video_id_from_track_json(track_json) {
                    println!("[RADIO] Fetching InnerTube recommendation for video_id: {}", video_id);

                    if let Some(related_id) = musicbot_audio_lavalink::get_related_video_id(&video_id).await {
                    musicbot_audio_lavalink::mark_as_played(&related_id).await;
                    musicbot_audio_lavalink::mark_as_played(&video_id).await;

                    let related_url = {
                            let https = std::str::from_utf8(&[104,116,116,112,115,58,47,47]).unwrap();
                            let www   = std::str::from_utf8(&[119,119,119,46]).unwrap();
                            let yt    = std::str::from_utf8(&[121,111,117,116,117,98,101,46,99,111,109]).unwrap();
                            let path  = std::str::from_utf8(&[47,119,97,116,99,104,63,118,61]).unwrap();
                            format!("{}{}{}{}{}", https, www, yt, path, related_id)
                        };

                        if let Some(mut lavalink_tracks) = resolve_tracks(&related_url, &lavalink_password).await {
                            if !lavalink_tracks.is_empty() {
                                let track = lavalink_tracks.remove(0);
                                println!("[RADIO] InnerTube recommendation queued: {}", track.title);
                                add_track_and_autoplay_bg(guild_id, track, core.clone(), audio.clone()).await;
                                used_recommendation = true;
                            }
                        }
                    }
                }
            }

            if !used_recommendation {
                println!("[RADIO] InnerTube unavailable, falling back to search");
                
                let time_secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as usize;
                
                let queries = ["creepy nuts", "ado", "yoasobi", "kenshi yonezu", "eve"];
                let query = queries[(time_secs / 30) % queries.len()];
                let prefix = std::str::from_utf8(&[121,116,115,101,97,114,99,104,58]).unwrap();

                if let Some(mut lavalink_tracks) = resolve_tracks(
                    &format!("{}{}", prefix, query),
                    &lavalink_password,
                ).await {
                    if !lavalink_tracks.is_empty() {
                        let track = lavalink_tracks.remove(0);
                        println!("[RADIO] Fallback radio queued: {}", track.title);
                        add_track_and_autoplay_bg(guild_id, track, core, audio).await;
                    }
                }
            }
        }
    }
}