use axum::extract::{Json, State};
use tower_cookies::Cookies;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::{AppState, CoreMessage, PlayerCommand, CommandResponse};
use crate::db_runtime::DbRuntime;
use crate::search::{search, SearchResult, TracksPreview};

use musicbot_core::event::RadioSource;
pub use musicbot_audio_lavalink::resolve_tracks;

// ============================================================ //
// ==== SMART-RADIO HANDLING FROM WEBUI ======================= //
// ============================================================ //
pub async fn trigger_radio(
    server_id: String,
    bot_index: usize,
    source: RadioSource,
    db: Arc<DbRuntime>,
    tracks_preview: Arc<TracksPreview>,
    tx: mpsc::Sender<CoreMessage>,
    lavalink_password: Arc<String>,
    local_tracks_dir: Arc<String>,
    docker_tracks_dir: Arc<String>,
) {
    println!("[WEBUI-RADIO] Stream triggered for bot #{} (Source: {:?})", bot_index, source);
    let time = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_micros() as usize;

    match source {
        RadioSource::Local => {
            let tracks_len = tracks_preview.tracks.len();
            if tracks_len > 0 {
                let random_idx = time % tracks_len;
                let local_track = &tracks_preview.tracks[random_idx];
                
                if let Some((file_path, _)) = db.get(&local_track.id) {
                    let docker_path = file_path.to_string_lossy().replace(local_tracks_dir.as_str(), docker_tracks_dir.as_str());
                    if let Some(mut lavalink_tracks) = resolve_tracks(&docker_path, &lavalink_password).await {
                        if !lavalink_tracks.is_empty() {
                            let mut track = lavalink_tracks.remove(0);
                            track.title = local_track.title.clone();
                            let _ = tx.send(CoreMessage::PlayTrack { server_id: server_id.clone(), bot_index, track }).await;
                        }
                    }
                }
            }
        }
        RadioSource::Network => {
            let queries = ["creepy nuts", "creepy nuts mirage", "creepy nuts dandandan", "ado", "ado mirror"];
            let query = queries[time % queries.len()];
            
            let prefix = std::str::from_utf8(&[121, 116, 115, 101, 97, 114, 99, 104, 58]).unwrap();
            if let Some(mut lavalink_tracks) = resolve_tracks(&format!("{}{}", prefix, query), &lavalink_password).await {
                if !lavalink_tracks.is_empty() {
                    let track = lavalink_tracks.remove(0);
                    let _ = tx.send(CoreMessage::PlayTrack { server_id: server_id.clone(), bot_index, track }).await;
                }
            }
        }
    }
}

// ============================================================ //
// ==== MAIN WEB COMMAND PROCESSOR (API POST) ================= //
// ============================================================ //
pub async fn handle_command(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(command): Json<PlayerCommand>,
) -> Json<CommandResponse> {

    let session_cookie = cookies.get("mbv2_session");
    if session_cookie.is_none() {
        println!("[WEBUI-WARN] Unauthorized API request rejected (Action: {})", command.action);
        return Json(CommandResponse { 
            success: false, 
            message: "Unauthorized! Please log in again.".into(), 
            results: None 
        });
    }

    let user_id = session_cookie.unwrap().value().to_string();
    let server_id = command.server_id.clone();
    
    let user_id_u64 = user_id.parse::<u64>().unwrap_or(0);
    let server_id_u64 = server_id.parse::<u64>().unwrap_or(0);
    let is_superadmin = state.superadmin_ids.contains(&user_id);
    
    let mut target_bot = command.bot_id.unwrap_or(0);

    if command.bot_id.is_none() && command.action != "join" {
        let busy_bots = state.hivemind.get_all_busy_bots().await;
        
        if let Some((u_guild, u_chan)) = state.hivemind.get_user_channel(user_id_u64).await {
            if u_guild == server_id_u64 {
                if let Some((b_idx, _, _)) = busy_bots.iter().find(|(_, g, c)| *g == u_guild && *c == u_chan) {
                    target_bot = *b_idx;
                } 
                else if let Some((b_idx, _, _)) = busy_bots.iter().find(|(_, g, _)| *g == server_id_u64) {
                    target_bot = *b_idx;
                }
            }
        } else {
            if let Some((b_idx, _, _)) = busy_bots.iter().find(|(_, g, _)| *g == server_id_u64) {
                target_bot = *b_idx;
            }
        }
    } else if command.action == "join" {
        target_bot = command.source.as_deref().unwrap_or("0").parse::<usize>().unwrap_or(0);
    }
    
    let has_permission = is_superadmin || {
        if let Some((u_guild, u_channel)) = state.hivemind.get_user_channel(user_id_u64).await {
            if u_guild == server_id_u64 {
                if command.action != "join" {
                    let bot_state = state.hivemind.get_bot_state(target_bot).await;
                    matches!(bot_state, musicbot_core::hivemind::BotState::Busy { channel_id, .. } if channel_id == u_channel)
                } else {
                    true
                }
            } else { false }
        } else { false }
    };

    if !has_permission {
        println!("[WEBUI-AUTH] Access denied (User: {} is not in the audio channel)", user_id);
        return Json(CommandResponse { 
            success: false, 
            message: "Access denied! You must be in a voice channel with the bot.".into(), 
            results: None 
        });
    }

    match command.action.as_str() {
        "play" => {
            if let Some(query) = &command.payload {
                let source = command.source.as_deref().unwrap_or("network");
                
                if source == "network" {
                    let search_query = if query.starts_with("http") { 
                        query.clone() 
                    } else { 
                        let prefix = std::str::from_utf8(&[121, 116, 115, 101, 97, 114, 99, 104, 58]).unwrap();
                        format!("{}{}", prefix, query) 
                    };
                    
                    if let Some(mut tracks) = resolve_tracks(&search_query, &state.lavalink_password).await { 
                        if !tracks.is_empty() {
                            let track = tracks.remove(0);
                            let _ = state.core_tx.send(CoreMessage::PlayTrack { server_id, bot_index: target_bot, track }).await;
                            return Json(CommandResponse { success: true, message: "Network: Added to queue!".into(), results: None });
                        }
                    }
                } else if source == "local" {
                    match search(&state.tracks_preview, query) {
                        SearchResult::NoMatch => {
                            return Json(CommandResponse { success: false, message: "No local results found.".into(), results: None });
                        }
                        SearchResult::Single { track_id } => {
                            if let Some((file_path, _)) = state.db.get(&track_id) {
                                let docker_path = file_path.to_string_lossy().replace(state.local_tracks_dir.as_str(), state.docker_tracks_dir.as_str());
                                if let Some(mut tracks) = resolve_tracks(&docker_path, &state.lavalink_password).await {
                                    let mut track = tracks.remove(0); 
                                    
                                    if let Some(local_track) = state.tracks_preview.tracks.iter().find(|t| t.id == track_id) {
                                        track.title = local_track.title.clone();
                                    }

                                    let _ = state.core_tx.send(CoreMessage::PlayTrack { server_id, bot_index: target_bot, track }).await;
                                    return Json(CommandResponse { success: true, message: "Local: Added!".into(), results: None });
                                }
                            }
                        }
                        SearchResult::Multiple { results } => {
                            let json_results: Vec<Value> = results.into_iter().map(|r| serde_json::json!({
                                "index": r.index,
                                "track_id": r.track_id,
                                "title": r.title,
                                "score": r.score
                            })).collect();
                            
                            return Json(CommandResponse { 
                                success: true, 
                                message: "Results found".into(), 
                                results: Some(serde_json::Value::Array(json_results)) 
                            });
                        }
                    }
                } else if source == "local_id" {
                    if let Some((file_path, _)) = state.db.get(query) {
                        let docker_path = file_path.to_string_lossy().replace(state.local_tracks_dir.as_str(), state.docker_tracks_dir.as_str());
                        if let Some(mut tracks) = resolve_tracks(&docker_path, &state.lavalink_password).await {
                            let mut track = tracks.remove(0); 
                            
                            if let Some(local_track) = state.tracks_preview.tracks.iter().find(|t| t.id == *query) {
                                track.title = local_track.title.clone();
                            } else {
                                track.title = "Local track".into();
                            }

                            let _ = state.core_tx.send(CoreMessage::PlayTrack { server_id, bot_index: target_bot, track }).await;
                            return Json(CommandResponse { success: true, message: "Selected from list: Added!".into(), results: None });
                        }
                    }
                }
                return Json(CommandResponse { success: false, message: "Search error!".into(), results: None });
            }
        },
        "skip" => { let _ = state.core_tx.send(CoreMessage::Skip { server_id, bot_index: target_bot }).await; },
        "clear" => {
            let _ = state.core_tx.send(CoreMessage::ClearQueue { server_id, bot_index: target_bot }).await;
            return Json(CommandResponse { success: true, message: "Queue cleared!".into(), results: None });
        }
        "play_pause" => { let _ = state.core_tx.send(CoreMessage::TogglePause { server_id, bot_index: target_bot }).await; },
        "seek" => {
            if let Some(sec_str) = &command.payload {
                if let Ok(seconds) = sec_str.parse::<u64>() {
                    let _ = state.core_tx.send(CoreMessage::Seek { server_id, bot_index: target_bot, seconds }).await;
                }
            }
        },
        "toggle_loop" => {
            let _ = state.core_tx.send(CoreMessage::ToggleLoop { server_id, bot_index: target_bot }).await;
            return Json(CommandResponse { success: true, message: "Track loop toggled".into(), results: None });
        },
        "radio_network" => { 
            let _ = state.core_tx.send(CoreMessage::ToggleNetworkRadio { server_id: server_id.clone(), bot_index: target_bot }).await; 
            
            let is_idle = {
                let players = state.ws_rx.borrow();
                if let Some(player) = players.values().find(|p| p.server_id == server_id && p.bot_id == target_bot) {
                    !player.is_playing
                } else {
                    true 
                }
            };

            if is_idle {
                trigger_radio(
                    server_id.clone(), 
                    target_bot,
                    RadioSource::Network, 
                    state.db.clone(), 
                    state.tracks_preview.clone(), 
                    state.core_tx.clone(), 
                    state.lavalink_password.clone(), 
                    state.local_tracks_dir.clone(), 
                    state.docker_tracks_dir.clone(),
                ).await;
            }
        },
        "radio_local" => { 
            let _ = state.core_tx.send(CoreMessage::ToggleLocalRadio { server_id: server_id.clone(), bot_index: target_bot }).await; 
            
            let is_idle = {
                let players = state.ws_rx.borrow();
                if let Some(player) = players.values().find(|p| p.server_id == server_id && p.bot_id == target_bot) {
                    !player.is_playing
                } else {
                    true
                }
            };

            if is_idle {
                trigger_radio(
                    server_id.clone(), 
                    target_bot,
                    RadioSource::Local, 
                    state.db.clone(), 
                    state.tracks_preview.clone(), 
                    state.core_tx.clone(), 
                    state.lavalink_password.clone(), 
                    state.local_tracks_dir.clone(), 
                    state.docker_tracks_dir.clone()
                ).await;
            }
        },
        "remove_track" => {
            let index = command.payload.clone().unwrap_or_default().parse::<usize>().unwrap_or(0);
            let _ = state.core_tx.send(CoreMessage::RemoveTrack { server_id, bot_index: target_bot, index }).await;
            return Json(CommandResponse { success: true, message: "Removed!".into(), results: None });
        },
        "move_track" => {
            if let Some(p) = &command.payload {
                let parts: Vec<&str> = p.split(':').collect();
                if parts.len() == 2 {
                    if let (Ok(from), Ok(to)) = (parts[0].parse::<usize>(), parts[1].parse::<usize>()) {
                        let _ = state.core_tx.send(CoreMessage::MoveTrack { server_id, bot_index: target_bot, from, to }).await;
                    }
                }
            }
            return Json(CommandResponse { success: true, message: "Moved!".into(), results: None });
        },
        "previous" => { let _ = state.core_tx.send(CoreMessage::Previous { server_id, bot_index: target_bot }).await; },
        "play_index" => {
            let index = command.payload.clone().unwrap_or_default().parse::<usize>().unwrap_or(0);
            let _ = state.core_tx.send(CoreMessage::PlayIndex { server_id, bot_index: target_bot, index }).await;
            return Json(CommandResponse { success: true, message: "Playing selected index".into(), results: None });
        }
        "volume" => {
            if let Some(vol_str) = &command.payload {
                if let Ok(volume) = vol_str.parse::<u8>() {
                    let _ = state.core_tx.send(CoreMessage::SetVolume { server_id, bot_index: target_bot, volume }).await;
                }
            }
            return Json(CommandResponse { success: true, message: "Volume changed".into(), results: None });
        },
        "join" => {
            if let Some(channel_id) = command.payload {
                let chan_u64 = channel_id.parse::<u64>().unwrap_or(0);
                let bots_in_this_channel = state.hivemind.get_bots_in_channel(server_id_u64, chan_u64).await;
                
                if bots_in_this_channel >= state.max_bots_per_channel {
                    return Json(CommandResponse { 
                        success: false, 
                        message: format!("Maximum bot limit ({}) reached in this channel!", state.max_bots_per_channel), 
                        results: None 
                    });
                }

                let _ = state.core_tx.send(CoreMessage::JoinChannel { server_id, channel_id, bot_index: target_bot }).await;
                return Json(CommandResponse { success: true, message: "Connecting to channel...".into(), results: None });
            }
        },
        "leave" => {
            let _ = state.core_tx.send(CoreMessage::LeaveChannel { server_id, bot_index: target_bot }).await;
            return Json(CommandResponse { success: true, message: "Leaving channel...".into(), results: None });
        },
        _ => {}
    }

    Json(CommandResponse { success: true, message: "Action sent to Rust.".into(), results: None })
}