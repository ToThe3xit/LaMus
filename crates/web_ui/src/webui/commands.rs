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
    last_track_json: Option<String>,
) {
    println!("[WEBUI-RADIO] Stream triggered for bot #{} (Source: {:?})", bot_index, source);
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_micros() as usize;

    match source {
        RadioSource::Local => {
            let tracks_len = tracks_preview.tracks.len();
            if tracks_len > 0 {
                let random_idx = time % tracks_len;
                let local_track = &tracks_preview.tracks[random_idx];

                if let Some((file_path, _)) = db.get(&local_track.id) {
                    let docker_path = file_path
                        .to_string_lossy()
                        .replace(local_tracks_dir.as_str(), docker_tracks_dir.as_str());

                    if let Some(mut lavalink_tracks) = resolve_tracks(&docker_path, &lavalink_password).await {
                        if !lavalink_tracks.is_empty() {
                            let mut track = lavalink_tracks.remove(0);
                            track.title = local_track.title.clone();
                            let _ = tx.send(CoreMessage::PlayTrack {
                                server_id: server_id.clone(),
                                bot_index,
                                track,
                            }).await;
                        }
                    }
                }
            }
        }

        RadioSource::Network => {
            let mut used_recommendation = false;

            if let Some(ref track_json) = last_track_json {
                if let Some(video_id) = musicbot_audio_lavalink::extract_video_id_from_track_json(track_json) {
                    println!("[WEBUI-RADIO] Fetching InnerTube recommendation for: {}", video_id);

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
                                println!("[WEBUI-RADIO] Recommendation queued: {}", track.title);
                                let _ = tx.send(CoreMessage::PlayTrack {
                                    server_id: server_id.clone(),
                                    bot_index,
                                    track,
                                }).await;
                                used_recommendation = true;
                            }
                        }
                    }
                }
            }

            if !used_recommendation {
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
                        let _ = tx.send(CoreMessage::PlayTrack {
                            server_id: server_id.clone(),
                            bot_index,
                            track,
                        }).await;
                    }
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
            results: None,
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
                } else if let Some((b_idx, _, _)) = busy_bots.iter().find(|(_, g, _)| *g == server_id_u64) {
                    target_bot = *b_idx;
                }
            }
        } else if let Some((b_idx, _, _)) = busy_bots.iter().find(|(_, g, _)| *g == server_id_u64) {
            target_bot = *b_idx;
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
            results: None,
        });
    }
    let owner_only_actions = ["play", "seek", "volume", "shuffle_queue", "sort_queue", 
                            "dedup_queue", "toggle_loop", "move_track", "play_index", 
                            "remove_track", "previous", "radio_network", "radio_local",
                            "play_search", "delegate", "revoke_delegate"];

    if owner_only_actions.contains(&command.action.as_str()) && !is_superadmin {
        let has_gov_perm = state.hivemind.governance
            .has_direct_permission(target_bot, user_id_u64, false)
            .await;
        if !has_gov_perm {
            return Json(CommandResponse {
                success: false,
                message: "Only the session owner or delegated users can perform this action.".into(),
                results: None,
            });
        }
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
                                results: Some(serde_json::Value::Array(json_results)),
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
        "shuffle_queue" => {
            let _ = state.core_tx.send(CoreMessage::ShuffleQueue { server_id, bot_index: target_bot }).await;
            return Json(CommandResponse { success: true, message: "Queue shuffled".into(), results: None });
        },
        "dedup_queue" => {
            let _ = state.core_tx.send(CoreMessage::DeduplicateQueue { server_id, bot_index: target_bot }).await;
            return Json(CommandResponse { success: true, message: "Queue deduplicated".into(), results: None });
        },
        "sort_queue" => {
            let mode = command.payload.clone().unwrap_or_else(|| "title".to_string());
            let _ = state.core_tx.send(CoreMessage::SortQueue { server_id, bot_index: target_bot, mode }).await;
            return Json(CommandResponse { success: true, message: "Queue sorted".into(), results: None });
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

            let last_track_json = {
                let players = state.ws_rx.borrow();
                players.values()
                    .find(|p| p.server_id == server_id && p.bot_id == target_bot)
                    .and_then(|p| p.thumbnail_url.clone())
                    .filter(|id| id.len() == 11)
                    .map(|id| {
                        let https = std::str::from_utf8(&[104,116,116,112,115,58,47,47]).unwrap();
                        let www   = std::str::from_utf8(&[119,119,119,46]).unwrap();
                        let yt    = std::str::from_utf8(&[121,111,117,116,117,98,101,46,99,111,109]).unwrap();
                        let path  = std::str::from_utf8(&[47,119,97,116,99,104,63,118,61]).unwrap();
                        let base  = format!("{}{}{}{}", https, www, yt, path);
                        format!("{{\"info\":{{\"uri\":\"{}{}\"}}}}", base, id)
                    })
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
                    last_track_json,
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
                    state.docker_tracks_dir.clone(),
                    None,
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
        },
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

                if !is_superadmin {
                    let user_voice = state.hivemind.get_user_channel(user_id_u64).await;
                    let is_in_target_channel = match user_voice {
                        Some((g, c)) => g == server_id_u64 && c == chan_u64,
                        None => false,
                    };
                    if !is_in_target_channel {
                        return Json(CommandResponse {
                            success: false,
                            message: "You can only invite the bot to your own voice channel.".into(),
                            results: None,
                        });
                    }
                }

                let bots_in_this_channel = state.hivemind.get_bots_in_channel(server_id_u64, chan_u64).await;
                if bots_in_this_channel >= state.max_bots_per_channel {
                    return Json(CommandResponse {
                        success: false,
                        message: format!("Maximum bot limit ({}) reached in this channel!", state.max_bots_per_channel),
                        results: None,
                    });
                }

                let requester_id = user_id.parse::<u64>().ok();

                let (bot_idx_from_source, requester_name) = if let Some(src) = &command.source {
                    let parts: Vec<&str> = src.splitn(2, ':').collect();
                    let idx = parts.get(0).and_then(|s| s.parse::<usize>().ok()).unwrap_or(target_bot);
                    let name = parts.get(1).map(|s| s.to_string());
                    (idx, name)
                } else {
                    (target_bot, None)
                };

                let _ = state.core_tx.send(CoreMessage::JoinChannel {
                    server_id,
                    channel_id,
                    bot_index: bot_idx_from_source,
                    requester_id,
                    requester_name,
                }).await;
                return Json(CommandResponse { success: true, message: "Connecting to channel...".into(), results: None });
            }
        },
        "skip" | "clear" | "leave" | "play_pause" => {
            let user_id_u64 = user_id.parse::<u64>().unwrap_or(0);
            let has_perm = state.hivemind.governance
                .has_direct_permission(target_bot, user_id_u64, is_superadmin)
                .await;

            if has_perm {
                match command.action.as_str() {
                    "skip" => { let _ = state.core_tx.send(CoreMessage::Skip { server_id, bot_index: target_bot }).await; }
                    "clear" => { let _ = state.core_tx.send(CoreMessage::ClearQueue { server_id, bot_index: target_bot }).await; }
                    "leave" => { let _ = state.core_tx.send(CoreMessage::LeaveChannel { server_id, bot_index: target_bot }).await; }
                    "play_pause" => { let _ = state.core_tx.send(CoreMessage::TogglePause { server_id, bot_index: target_bot }).await; }
                    _ => {}
                }
                return Json(CommandResponse { success: true, message: "Action executed".into(), results: None });
            }

            let vote_action = match command.action.as_str() {
                "skip" => musicbot_core::governance::VoteAction::Skip,
                "clear" => musicbot_core::governance::VoteAction::ClearQueue,
                "leave" => musicbot_core::governance::VoteAction::LeaveChannel,
                "play_pause" => musicbot_core::governance::VoteAction::TogglePause,
                _ => return Json(CommandResponse { success: false, message: "Unknown action".into(), results: None }),
            };

            let bot_state = state.hivemind.get_bot_state(target_bot).await;
            let (guild_id_u64, channel_id_u64) = match bot_state {
                musicbot_core::hivemind::BotState::Busy { guild_id, channel_id } => (guild_id, channel_id),
                _ => return Json(CommandResponse { success: false, message: "Bot not active".into(), results: None }),
            };

            let owner_id = state.hivemind.governance.get_owner_id(target_bot).await;
            let mut channel_members = state.hivemind
                .get_channel_human_members(guild_id_u64, channel_id_u64)
                .await;

            let hivemind_ref = &state.hivemind;
            let mut eligible = Vec::new();
            for member_id in channel_members.drain(..) {
                let is_bot = hivemind_ref.is_bot_discord_id(member_id).await;
                let is_owner = Some(member_id) == owner_id;
                let is_superadmin_user = hivemind_ref.superadmin_ids.contains(&member_id.to_string());
                if !is_bot && !is_owner && !is_superadmin_user {
                    eligible.push(member_id);
                }
            }

            let vote_pct = state.hivemind.governance.required_percentage;
            match state.hivemind.governance.start_vote(
                target_bot,
                server_id.clone(),
                vote_action,
                command.payload.clone(),
                user_id_u64,
                eligible,
                vote_pct,
            ).await {
                Ok(()) => {
                    let core_tx = state.core_tx.clone();
                    let srv = server_id.clone();
                    let uid = user_id_u64;
                    let bidx = target_bot;
                    tokio::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                        let _ = core_tx.send(CoreMessage::CastVote {
                            server_id: srv,
                            bot_index: bidx,
                            voter_id: uid,
                        }).await;
                    });
                    return Json(CommandResponse { success: true, message: "vote_started".into(), results: None });
                }
                Err(e) => {
                    return Json(CommandResponse { success: false, message: e.into(), results: None });
                }
            }
        },
        "vote" => {
            let voter_id = user_id.parse::<u64>().unwrap_or(0);
            let _ = state.core_tx.send(CoreMessage::CastVote {
                server_id,
                bot_index: target_bot,
                voter_id,
            }).await;
            return Json(CommandResponse { success: true, message: "Vote cast".into(), results: None });
        },
        "cancel_vote" => {
            if !is_superadmin {
                return Json(CommandResponse { success: false, message: "Moderator only".into(), results: None });
            }
            let _ = state.core_tx.send(CoreMessage::CancelVote {
                server_id,
                bot_index: target_bot,
            }).await;
            return Json(CommandResponse { success: true, message: "Vote cancelled".into(), results: None });
        },
        "rollback_vote" => {
            if !is_superadmin {
                return Json(CommandResponse { success: false, message: "Moderator only".into(), results: None });
            }
            let _ = state.core_tx.send(CoreMessage::RollbackLastVote {
                server_id,
                bot_index: target_bot,
            }).await;
            return Json(CommandResponse { success: true, message: "Rollback initiated".into(), results: None });
        },
        "delegate" => {
            if let Some(target_str) = &command.payload {
                let target_id = target_str.parse::<u64>().unwrap_or(0);
                let caller_id = user_id.parse::<u64>().unwrap_or(0);
                let _ = state.core_tx.send(CoreMessage::DelegatePermission {
                    server_id,
                    bot_index: target_bot,
                    caller_id,
                    target_id,
                }).await;
            }
            return Json(CommandResponse { success: true, message: "Delegation updated".into(), results: None });
        },
        "revoke_delegate" => {
            if let Some(target_str) = &command.payload {
                let target_id = target_str.parse::<u64>().unwrap_or(0);
                let _ = state.core_tx.send(CoreMessage::RevokeDelegate {
                    server_id,
                    bot_index: target_bot,
                    target_id,
                }).await;
            }
            return Json(CommandResponse { success: true, message: "Delegation revoked".into(), results: None });
        },
        _ => {}
    }

    Json(CommandResponse { success: true, message: "Action sent to Rust.".into(), results: None })
}