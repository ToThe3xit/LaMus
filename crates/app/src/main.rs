use std::sync::Arc;
use std::path::Path;
use std::collections::HashMap;
use tokio::sync::{mpsc, RwLock, Mutex};
use serenity::http::Http;
use serde::Deserialize;

use musicbot_web_ui::{CoreMessage, PlayerState};

use musicbot_discord_adapter::discord::start_discord;
use musicbot_discord_adapter::db_runtime::DbRuntime;
use musicbot_discord_adapter::search::load_tracks_preview;
use musicbot_discord_adapter::adapter::DiscordAudioAdapter;

use musicbot_core::BotInstance;
use musicbot_core::engine::CoreState;
use musicbot_core::command::Command;

// ============================================================ //
// ==== CONFIGURATION STRUCTURES AND DATA ======================= //
// ============================================================ //
#[derive(Deserialize)]
pub struct AppConfig {
    pub lavalink_password: String,
    pub db_path: String,
    pub tracks_preview_path: String,
    pub normalization_path: String,
    pub local_tracks_dir: String, 
    pub docker_tracks_dir: String, 
    pub default_volume: u8, 
    pub superadmin_ids: Vec<String>,
    pub max_bots_per_channel: usize,
    pub bots: Vec<BotConfig>,
    pub discord_client_id: String,
    pub discord_client_secret: String,
    pub discord_redirect_uri: String,
    pub observer_bot_token: String
}

#[derive(Deserialize)]
pub struct BotConfig {
    pub name: String,
    pub token: String,
}

pub struct BotNode {
    pub id: usize,
    pub name: String,
    pub http: Arc<Http>,
    pub core: Arc<Mutex<CoreState>>,
    pub audio: Arc<Mutex<DiscordAudioAdapter>>,
    pub cmd_tx: tokio::sync::mpsc::UnboundedSender<musicbot_discord_adapter::discord::WebDiscordCommand>,
}

// ============================================================ //
// ==== MAIN SYSTEM FUNCTION (ENTRY POINT) ================== //
// ============================================================ //
#[tokio::main]
async fn main() {
    println!("[MAIN] Loading system configuration...");
    let config_str = std::fs::read_to_string("config.yaml")
        .expect("config.yaml file not found");
    let config: AppConfig = serde_yaml::from_str(&config_str)
        .expect("Error parsing config.yaml");

    println!("[MAIN] Initializing persistence module...");

    // ============================================================ //
    // ==== DATABASE AND MEMORY INITIALIZATION =================== //
    // ============================================================ //
    if let Err(e) = musicbot_persistence::db::loader::load_or_rebuild(
        Path::new(&config.local_tracks_dir),
        Path::new(&config.db_path),
        true,
        Path::new(&config.normalization_path),
        Path::new(&config.tracks_preview_path),
    ) {
        panic!("Critical scanning error: {}", e); 
    }

    // ============================================================ //
    // ==== PRE-WARM INNERTUBE VERSION CACHE ====================== //
    // ============================================================ //
    println!("[MAIN] Resolving InnerTube client version...");
    musicbot_audio_lavalink::fetch_innertube_client_version().await;

    let tracks_preview = Arc::new(load_tracks_preview(Path::new(&config.tracks_preview_path))
        .expect("Failed to load tracks preview"));
    let db = Arc::new(DbRuntime::load(Path::new(&config.db_path))
        .expect("Failed to load db.yaml"));

    let live_bots_state: Arc<RwLock<Vec<BotInstance>>> = Arc::new(RwLock::new(Vec::new()));
    let (web_tx, mut web_rx) = mpsc::channel::<CoreMessage>(100);

    let mut nodes: Vec<BotNode> = Vec::new();
    let mut bot_discord_ids: std::collections::HashMap<u64, usize> = std::collections::HashMap::new();

    let (obs_tx, mut obs_rx) = tokio::sync::mpsc::unbounded_channel::<musicbot_discord_adapter::discord::ObserverMessage>();
    let hivemind = Arc::new(musicbot_core::hivemind::HiveMind::new(config.bots.len()));
    let hm_observer = hivemind.clone();
    let observer_token = config.observer_bot_token.clone();
    
    let observer_bot_count = config.bots.len(); 

    tokio::spawn(async move {
        musicbot_discord_adapter::discord::start_observer(observer_token, hm_observer, obs_tx, observer_bot_count).await;
    });

    // ============================================================ //
    // ==== ALLOCATION AND START OF NODES (BOTS) ======================= //
    // ============================================================ //
    println!("[MAIN] Fetching bot identities...");
    let mut bot_identities = Vec::new();
    for bot_cfg in &config.bots {
        let http = Http::new(&bot_cfg.token);
        bot_identities.push(async move {
            http.get_current_user().await
        });
    }

    let resolved_users = futures::future::join_all(bot_identities).await;

    println!("[MAIN] Allocating instance pool...");
    for (i, user_res) in resolved_users.into_iter().enumerate() {
        let user = user_res.expect("Failed to fetch bot data from Discord");
        let bot_cfg = &config.bots[i];
        let bot_id = user.id.get();
        
        bot_discord_ids.insert(bot_id, i);

        println!("[MAIN] Initializing node [{}]: {} (ID: {})", i, bot_cfg.name, bot_id);
        
        let lavalink_backend = musicbot_audio_lavalink::LavalinkBackend::new(bot_id, &config.lavalink_password).await;
        
        let core = Arc::new(Mutex::new(CoreState::new()));

        {
            let mut c = core.lock().await;
            c.playback.volume = config.default_volume;
        }

        let audio = Arc::new(Mutex::new(DiscordAudioAdapter::new(core.clone(), lavalink_backend)));
        let (cmd_tx, cmd_rx) = tokio::sync::mpsc::unbounded_channel();
        let http_arc = Arc::new(Http::new(&bot_cfg.token));

        nodes.push(BotNode {
            id: i,
            name: bot_cfg.name.clone(),
            http: http_arc.clone(),
            core: core.clone(),
            audio: audio.clone(),
            cmd_tx,
        });

        let d_token = bot_cfg.token.clone();
        let d_state = live_bots_state.clone();
        let d_core = core.clone();
        let d_audio = audio.clone();
        let d_db = db.clone();
        let d_tracks = tracks_preview.clone();
        let d_pass = config.lavalink_password.clone();
        let d_local = config.local_tracks_dir.clone();
        let d_docker = config.docker_tracks_dir.clone();
        let d_vol = config.default_volume; 
        let d_allocs = hivemind.clone();
        let bot_idx = i;
        let d_max_bots = config.max_bots_per_channel;

        tokio::spawn(async move {
            start_discord(
                d_token, d_state, d_core, d_audio, d_db, d_tracks, cmd_rx, 
                d_pass, d_local, d_docker, d_vol, bot_idx, d_allocs, d_max_bots
            ).await;
        });
    
        // ============================================================ //
        // ==== INTERNAL BOT CLOCK (STATE PUSHER) ================== //
        // ============================================================ //
        let clock_core = core.clone();
        let clock_hivemind = hivemind.clone();
        let clock_bot_index = i;

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                
                let state = clock_hivemind.get_bot_state(clock_bot_index).await;
                if let musicbot_core::hivemind::BotState::Busy { guild_id, channel_id } = state {
                    
                    let mut c = clock_core.lock().await;
                    
                    if c.playback.mode == musicbot_core::playback::PlaybackMode::Playing {
                        c.playback.position_seconds += 1;

                        if let Some(track) = c.queue.current_track() {
                            let pos = c.playback.position_seconds;
                            let dur = track.duration_seconds;
                            let is_network = track.source == musicbot_core::track::AudioSource::Lavalink;
                            let radio_on = c.network_radio_enabled || c.local_radio_enabled;

                            if is_network && radio_on && dur > 0 {
                                let threshold = if dur > 60 {
                                    (dur / 2).min(dur.saturating_sub(30))
                                } else {
                                    dur / 2
                                };

                                if pos == threshold {
                                    if let Some(track_json) = track.lavalink_id.clone() {
                                        let hm = clock_hivemind.clone();
                                        let bot_idx = clock_bot_index;
                                        tokio::spawn(async move {
                                            if let Some(vid) = musicbot_audio_lavalink::extract_video_id_from_track_json(&track_json) {
                                                if let Some(related) = musicbot_audio_lavalink::get_related_video_id(&vid).await {
                                                    musicbot_audio_lavalink::mark_as_played(&related).await;
                                                    hm.prefetched_radio.write().await.insert(bot_idx, related);
                                                    println!("[RADIO] Pre-fetched next recommendation for bot #{}", bot_idx);
                                                }
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                    
                    let mut cached_state = musicbot_core::hivemind::CachedPlayerState {
                        server_id: guild_id.to_string(),
                        channel_id: channel_id.to_string(),
                        bot_id: clock_bot_index,
                        track_name: "Waiting for a track...".into(),
                        author: "-".into(),
                        progress_percent: 0,
                        is_playing: c.playback.mode == musicbot_core::playback::PlaybackMode::Playing,
                        thumbnail_url: None,
                        position_seconds: c.playback.position_seconds,
                        duration_seconds: 0,
                        up_next: c.queue.tracks().iter().take(250).map(|t| t.title.clone()).collect(),
                        history: c.history.iter().rev().take(50).map(|t| t.title.clone()).collect(),
                        volume: c.playback.volume,
                        is_looping: c.playback.is_looping,
                        is_radio_active: c.network_radio_enabled || c.local_radio_enabled,
                    };
                    
                    cached_state.history.reverse();
                    
                    if let Some(track) = c.queue.current_track() {
                        cached_state.track_name = track.title.clone();
                        cached_state.duration_seconds = track.duration_seconds;
                        
                        if track.source == musicbot_core::track::AudioSource::Lavalink {
                            let search_string = format!("{:?}", track);
                            if let Some(start) = search_string.find("watch?v=") {
                                let video_id = &search_string[start + 8..start + 8 + 11];
                                cached_state.thumbnail_url = Some(video_id.to_string());
                            }
                        }
                        
                        if track.duration_seconds > 0 {
                            let pos = c.playback.position_seconds.min(track.duration_seconds);
                            cached_state.position_seconds = pos;
                            cached_state.progress_percent = ((pos as f64 / track.duration_seconds as f64) * 100.0) as u8;
                            let mins = track.duration_seconds / 60;
                            let secs = track.duration_seconds % 60;
                            let pos_mins = pos / 60;
                            let pos_secs = pos % 60;
                            cached_state.author = format!("{:02}:{:02} / {:02}:{:02}", pos_mins, pos_secs, mins, secs);
                        }
                    }
                    
                    drop(c);
                    
                    clock_hivemind.update_cached_state(clock_bot_index, cached_state).await;
                }else{
                    let mut states = clock_hivemind.player_states.write().await;
                    states.remove(&clock_bot_index);
                }
            }
        });
    }

    let initial_ws_state: HashMap<String, PlayerState> = HashMap::new();
    let (ws_tx, ws_rx) = tokio::sync::watch::channel(initial_ws_state);

    let _broadcaster_nodes = nodes.iter().map(|n| (n.id, n.core.clone())).collect::<Vec<_>>();

    // ============================================================ //
    // ==== WEBSOCKET SYNCHRONIZATION SUBSYSTEM (CACHE READER) ===== //
    // ============================================================ //    
    let ws_hivemind = hivemind.clone(); 
    
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            let mut multi_state = HashMap::new();
            
            let ram_states = ws_hivemind.player_states.read().await.clone();
            
            for (bot_id, cached) in ram_states {
                let compound_key = format!("{}_{}", cached.server_id, bot_id);
                
                let ui_state = PlayerState {
                    server_id: cached.server_id,
                    channel_id: cached.channel_id,
                    bot_id: cached.bot_id,
                    track_name: cached.track_name,
                    author: cached.author,
                    progress_percent: cached.progress_percent,
                    is_playing: cached.is_playing,
                    thumbnail_url: cached.thumbnail_url,
                    position_seconds: cached.position_seconds,
                    duration_seconds: cached.duration_seconds,
                    up_next: cached.up_next,
                    history: cached.history,
                    volume: cached.volume,
                    is_looping: cached.is_looping,
                    is_radio_active: cached.is_radio_active,
                };
                
                multi_state.insert(compound_key, ui_state);
            }
            
            let _ = ws_tx.send(multi_state);
        }
    });

    // ============================================================ //
    // ==== GRAPHICAL INTERFACE INITIALIZATION (WEBUI) ========== //
    // ============================================================ //    
    let web_https: Vec<Arc<Http>> = nodes.iter().map(|n| n.http.clone()).collect();
    let web_db = Arc::new(musicbot_web_ui::db_runtime::DbRuntime::load(Path::new(&config.db_path)).expect("Failed to load db webui"));
    let web_tracks = Arc::new(musicbot_web_ui::search::load_tracks_preview(Path::new(&config.tracks_preview_path)).expect("Failed to load tracks webui"));
    let web_bots_state = live_bots_state.clone();

    let w_pass = config.lavalink_password.clone();
    let w_local = config.local_tracks_dir.clone();
    let w_docker = config.docker_tracks_dir.clone();
    
    let web_allocs = hivemind.clone(); 
    
    let c_client_id = config.discord_client_id.clone();
    let c_client_secret = config.discord_client_secret.clone();
    let c_redirect_uri = config.discord_redirect_uri.clone();

    let web_admin = config.superadmin_ids.clone();
    let web_max_bots = config.max_bots_per_channel;

    let web_tx_for_server = web_tx.clone();
    tokio::spawn(async move {
        musicbot_web_ui::start_server(
            web_tx_for_server, 
            web_bots_state, 
            web_db, 
            web_tracks, 
            ws_rx, 
            web_https, 
            w_pass, 
            w_local, 
            w_docker, 
            web_allocs,
            c_client_id,
            c_client_secret,
            c_redirect_uri,
            web_admin,
            web_max_bots,
        ).await;
    });

    let router_db = db.clone();
    let router_tracks = tracks_preview.clone();
    let router_pass = Arc::new(config.lavalink_password.clone());
    let router_local = Arc::new(config.local_tracks_dir.clone());
    let router_docker = Arc::new(config.docker_tracks_dir.clone());
    println!("🧠 [ROUTER] Orchestrator ready. Managing {} instances...", nodes.len());

    let (track_end_tx, mut track_end_rx) = tokio::sync::mpsc::unbounded_channel::<(serenity::model::id::GuildId, u64)>();
    if musicbot_audio_lavalink::TRACK_END_TX.get().is_none() {
        musicbot_audio_lavalink::TRACK_END_TX.set(track_end_tx).expect("Err setting TRACK_END_TX");
    }
    
    let web_tx_clone = web_tx.clone();
    let track_end_hivemind = hivemind.clone(); // <-- Using HiveMind
    let bot_discord_ids_clone = bot_discord_ids.clone();

    // ============================================================ //
    // ==== LAVALINK EVENT LISTENING (AUTO-SKIP) ============ //
    // ============================================================ //
    tokio::spawn(async move {
        while let Some((guild_id, bot_user_id)) = track_end_rx.recv().await {
            let server_id = guild_id.get().to_string();
            
            if let Some(&bot_index) = bot_discord_ids_clone.get(&bot_user_id) {
                let bot_state = track_end_hivemind.get_bot_state(bot_index).await;
                
                let is_bot_in_guild = match bot_state {
                    musicbot_core::hivemind::BotState::Busy { guild_id: b_guild, .. } => b_guild == guild_id.get(),
                    _ => false,
                };

                if is_bot_in_guild {
                    println!("[LAVALINK] Playback finished (Server: {}, Bot: {}). Initializing Auto-Skip...", server_id, bot_index);
                    let _ = web_tx_clone.send(CoreMessage::Skip { server_id: server_id.clone(), bot_index }).await;
                } else {
                    println!("[ROUTER-WARN] Bot {} reported track end, but according to HiveMind it is not on server {}", bot_index, server_id);
                }
            }
        }
    });
    
    // ============================================================ //
    // ==== MAIN COMMAND ROUTER (EVENT LOOP) ==================== //
    // ============================================================ //
    loop {
        tokio::select! {
            Some(obs_msg) = obs_rx.recv() => {
                match obs_msg {
                    musicbot_discord_adapter::discord::ObserverMessage::Search { guild_id: _guild_id, voice_channel_id: _voice_channel_id, text_channel_id, bot_index, query } => {
                        let pass = router_pass.clone();
                        let web_tx = web_tx.clone();
                        let server_id = _guild_id.to_string();
                        let channel_id = _voice_channel_id.to_string();
                        
                        let bot_http = nodes.iter().find(|n| n.id == bot_index).map(|n| n.http.clone());

                        tokio::spawn(async move {
                            let _ = web_tx.send(CoreMessage::JoinChannel { server_id: server_id.clone(), channel_id, bot_index }).await;
                            let prefix = std::str::from_utf8(&[121, 116, 115, 101, 97, 114, 99, 104, 58]).unwrap();
                            let network_query = if query.starts_with("http") { query.to_string() } else { format!("{}{}", prefix, query) };

                            if let Some(mut tracks) = musicbot_discord_adapter::discord::commands::resolve_tracks(&network_query, &pass).await {
                                if !tracks.is_empty() {
                                    let track = tracks.remove(0);
                                    let track_title = track.title.clone();
                                    
                                    let _ = web_tx.send(CoreMessage::PlayTrack { server_id, track, bot_index }).await;

                                    if let Some(http) = bot_http {
                                        let ch = serenity::model::id::ChannelId::new(text_channel_id);
                                        let msg = format!("🎵 **Bot #{} here!** Added to queue from network: `{}`", bot_index, track_title);
                                        let _ = ch.send_message(&http, serenity::builder::CreateMessage::new().content(msg)).await;
                                    }
                                }
                            }
                        });
                    },
                    musicbot_discord_adapter::discord::ObserverMessage::SearchLocal { guild_id: _guild_id, voice_channel_id: _voice_channel_id, text_channel_id, bot_index, query } => {
                        let web_tx = web_tx.clone();
                        let server_id = _guild_id.to_string();
                        let channel_id = _voice_channel_id.to_string();
                        let db = router_db.clone();
                        let local_dir = router_local.clone();
                        let docker_dir = router_docker.clone();
                        let pass = router_pass.clone();
                        let tracks_prev = router_tracks.clone();
                        
                        let bot_http = nodes.iter().find(|n| n.id == bot_index).map(|n| n.http.clone());

                        tokio::spawn(async move {
                            let _ = web_tx.send(CoreMessage::JoinChannel { server_id: server_id.clone(), channel_id, bot_index }).await;

                            match musicbot_discord_adapter::search::search(&tracks_prev, &query) {
                                musicbot_discord_adapter::search::SearchResult::Single { track_id } => {
                                    let (file_path, _) = db.get(&track_id).map(|(p, d)| (p.to_string_lossy().to_string(), *d)).unwrap_or_else(|| ("".to_string(), 0));
                                    let title = tracks_prev.tracks.iter().find(|t| t.id == track_id).map(|t| t.title.clone()).unwrap_or(track_id.clone());
                                    let docker_path = file_path.replace(local_dir.as_str(), docker_dir.as_str());

                                    if let Some(mut tracks) = musicbot_discord_adapter::discord::commands::resolve_tracks(&docker_path, &pass).await {
                                        if !tracks.is_empty() {
                                            let mut track = tracks.remove(0);
                                            track.title = title.clone();
                                            let _ = web_tx.send(CoreMessage::PlayTrack { server_id, track, bot_index }).await;

                                            if let Some(http) = &bot_http {
                                                let ch = serenity::model::id::ChannelId::new(text_channel_id);
                                                let msg = format!("**Bot #{} here!** Added from local database: `{}`", bot_index, title);
                                                let _ = ch.send_message(http, serenity::builder::CreateMessage::new().content(msg)).await;
                                            }
                                        }
                                    }
                                },
                                musicbot_discord_adapter::search::SearchResult::Multiple { results } => {
                                    if let Some(http) = &bot_http {
                                        let total = results.len();
                                        let mut list = format!("Found **{} matches**. Please provide more specific tokens:\n", total);
                                        
                                        for t in results.iter().take(5) {
                                            let toks = t.sample_tokens.join(" ");
                                            list.push_str(&format!("{}. **{}** -> `{}`\n", t.index, t.title, toks));
                                        }
                                        if total > 5 {
                                            list.push_str(&format!("...and {} more!\n", total - 5));
                                        }

                                        let ch = serenity::model::id::ChannelId::new(text_channel_id);
                                        let _ = ch.send_message(http, serenity::builder::CreateMessage::new().content(list)).await;
                                    }
                                },
                                musicbot_discord_adapter::search::SearchResult::NoMatch => {
                                    if let Some(http) = &bot_http {
                                        let ch = serenity::model::id::ChannelId::new(text_channel_id);
                                        let _ = ch.send_message(http, serenity::builder::CreateMessage::new().content("❌ Nothing found. Provide correct tokens.")).await;
                                    }
                                }
                            }
                        });
                    },
                    musicbot_discord_adapter::discord::ObserverMessage::Action { guild_id: _guild_id, text_channel_id, bot_index, action } => {
                        let web_tx = web_tx.clone();
                        let server_id = _guild_id.to_string();
                        let bot_http = nodes.iter().find(|n| n.id == bot_index).map(|n| n.http.clone());

                        tokio::spawn(async move {
                            match action.as_str() {
                                "skip" => { let _ = web_tx.send(CoreMessage::Skip { server_id, bot_index }).await; },
                                "leave" => { let _ = web_tx.send(CoreMessage::LeaveChannel { server_id, bot_index }).await; },
                                "pause" | "resume" => { let _ = web_tx.send(CoreMessage::TogglePause { server_id, bot_index }).await; },
                                "clear" => { let _ = web_tx.send(CoreMessage::ClearQueue { server_id, bot_index }).await; },
                                _ => {}
                            }

                            if let Some(http) = bot_http {
                                let ch = serenity::model::id::ChannelId::new(text_channel_id);
                                let action_en = match action.as_str() {
                                    "skip" => "Skipped track", "leave" => "Left channel", 
                                    "pause" => "Paused", "resume" => "Resumed", "clear" => "Cleared queue", _ => "Command executed"
                                };
                                let msg = format!("**Bot #{}** reporting: {}", bot_index, action_en);
                                let _ = ch.send_message(&http, serenity::builder::CreateMessage::new().content(msg)).await;
                            }
                        });
                    }
                }
            },
            Some(msg) = web_rx.recv() => {
                match msg {
                    CoreMessage::JoinChannel { server_id, channel_id, bot_index } => {
                        let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                        let c_id = serenity::model::id::ChannelId::new(channel_id.parse().unwrap_or(0));
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            println!("[ROUTER] Join command sent to node '{}'", node.name);
                            let _ = node.cmd_tx.send(musicbot_discord_adapter::discord::WebDiscordCommand::Join(guild_id, c_id));
                        }
                    },
                    CoreMessage::SetVolume { server_id, volume, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::SetVolume { volume }) };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::LeaveChannel { server_id, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            println!("[ROUTER] Leave command sent to node '{}'", node.name);
                            let g_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let _ = node.cmd_tx.send(musicbot_discord_adapter::discord::WebDiscordCommand::Leave(g_id));
                        }
                    },
                    CoreMessage::PlayTrack { server_id, track, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            musicbot_discord_adapter::discord::commands::add_track_and_autoplay_bg(guild_id, track, node.core.clone(), node.audio.clone()).await;
                        }
                    },
                    CoreMessage::Skip { server_id, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::Skip) };
                            let mut radio_source = None;
                            for ev in &events { if let musicbot_core::event::Event::RadioTriggered { source } = ev { radio_source = Some(source.clone()); } }
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                            if let Some(source) = radio_source {
                                let prefetched = hivemind.prefetched_radio.write().await.remove(&bot_index);
                                if let Some(ref pre_id) = prefetched {
                                    println!("[RADIO] Using pre-fetched recommendation: {}", pre_id);
                                    let related_url = {
                                        let https = std::str::from_utf8(&[104,116,116,112,115,58,47,47]).unwrap();
                                        let www   = std::str::from_utf8(&[119,119,119,46]).unwrap();
                                        let yt    = std::str::from_utf8(&[121,111,117,116,117,98,101,46,99,111,109]).unwrap();
                                        let path  = std::str::from_utf8(&[47,119,97,116,99,104,63,118,61]).unwrap();
                                        format!("{}{}{}{}{}", https, www, yt, path, pre_id)
                                    };
                                    if let Some(mut lavalink_tracks) = musicbot_discord_adapter::discord::commands::resolve_tracks(&related_url, &router_pass).await {
                                        if !lavalink_tracks.is_empty() {
                                            let track = lavalink_tracks.remove(0);
                                            println!("[RADIO] Pre-fetched track queued: {}", track.title);
                                            let guild_id2 = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                                            musicbot_discord_adapter::discord::commands::add_track_and_autoplay_bg(guild_id2, track, node.core.clone(), node.audio.clone()).await;
                                        } else {
                                            musicbot_discord_adapter::discord::commands::trigger_radio(guild_id, source, node.core.clone(), node.audio.clone(), router_db.clone(), router_tracks.clone(), router_pass.clone(), router_local.clone(), router_docker.clone()).await;
                                        }
                                    } else {
                                        musicbot_discord_adapter::discord::commands::trigger_radio(guild_id, source, node.core.clone(), node.audio.clone(), router_db.clone(), router_tracks.clone(), router_pass.clone(), router_local.clone(), router_docker.clone()).await;
                                    }
                                } else {
                                    musicbot_discord_adapter::discord::commands::trigger_radio(guild_id, source, node.core.clone(), node.audio.clone(), router_db.clone(), router_tracks.clone(), router_pass.clone(), router_local.clone(), router_docker.clone()).await;
                                }
                            }
                        }
                    },
                   CoreMessage::ToggleNetworkRadio { server_id: _, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let mut c = node.core.lock().await; c.handle_command(Command::ToggleNetworkRadio);
                        }
                    },
                    CoreMessage::ToggleLocalRadio { server_id: _, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let mut c = node.core.lock().await; c.handle_command(Command::ToggleLocalRadio);
                        }
                    },
                    CoreMessage::TogglePause { server_id, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = {
                                let mut c = node.core.lock().await;
                                if c.playback.mode == musicbot_core::playback::PlaybackMode::Playing { c.handle_command(Command::Pause) } else { c.handle_command(Command::Play) }
                            };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::Seek { server_id, seconds, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::Seek { seconds }) };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::ClearQueue { server_id, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::Clear) };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::RemoveTrack { server_id, index, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::RemoveAtIndex { index }) };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::MoveTrack { server_id, from, to, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::MoveTrack { from, to }) };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::Previous { server_id, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::Previous) };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::PlayIndex { server_id, index, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::PlayIndex { index }) };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::ToggleLoop { server_id, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = { let mut c = node.core.lock().await; c.handle_command(Command::ToggleLoop) };
                            musicbot_discord_adapter::discord::commands::process_core_events(guild_id, events, node.audio.clone()).await;
                        }
                    },
                    CoreMessage::ShuffleQueue { server_id, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));

                            let events = {
                                let mut c = node.core.lock().await;
                                c.handle_command(Command::ShuffleQueue)
                            };

                            musicbot_discord_adapter::discord::commands::process_core_events(
                                guild_id,
                                events,
                                node.audio.clone()
                            ).await;
                        }
                    },
                    CoreMessage::DeduplicateQueue { server_id, bot_index } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let events = {
                                let mut c = node.core.lock().await;
                                c.handle_command(Command::DeduplicateQueue)
                            };
                            musicbot_discord_adapter::discord::commands::process_core_events(
                                guild_id,
                                events,
                                node.audio.clone()
                            ).await;
                        }
                    },
                    CoreMessage::SortQueue { server_id, bot_index, mode } => {
                        if let Some(node) = nodes.iter().find(|n| n.id == bot_index) {
                            let guild_id = serenity::model::id::GuildId::new(server_id.parse().unwrap_or(0));
                            let sort_mode = match mode.as_str() {
                                "duration" => musicbot_core::queue::SortMode::Duration,
                                //"source"   => musicbot_core::queue::SortMode::Source,
                                _          => musicbot_core::queue::SortMode::Title,
                            };
                            let events = {
                                let mut c = node.core.lock().await;
                                c.handle_command(Command::SortQueue { mode: sort_mode })
                            };
                            musicbot_discord_adapter::discord::commands::process_core_events(
                                guild_id,
                                events,
                                node.audio.clone()
                            ).await;
                        }
                    },                
                }
            }
        }
    }
}