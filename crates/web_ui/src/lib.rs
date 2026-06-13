pub mod db_runtime;
pub mod search;
pub mod webui {
    pub mod commands;
}

use crate::db_runtime::DbRuntime;
use crate::search::{search, SearchResult, TracksPreview};

use musicbot_core::track::Track;
use musicbot_core::BotInstance;

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Json, Path, State, Query},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde_json::json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use serde_json::Value;
use serenity::http::Http;
use tower_cookies::{CookieManagerLayer,Cookies};

// ============================================================ //
// ==== DATA STRUCTURES AND MESSAGES (API -> CORE) ============ //
// ============================================================ //
#[derive(Deserialize)]
pub struct SearchParams {
    q: String,
}

#[derive(Debug)]
pub enum CoreMessage {
    PlayTrack { server_id: String, bot_index: usize, track: Track },
    Skip { server_id: String, bot_index: usize },
    TogglePause { server_id: String, bot_index: usize },
    Seek { server_id: String, bot_index: usize, seconds: u64 },
    ToggleNetworkRadio { server_id: String, bot_index: usize },
    ToggleLocalRadio { server_id: String, bot_index: usize },
    ClearQueue { server_id: String, bot_index: usize },
    RemoveTrack { server_id: String, bot_index: usize, index: usize },
    MoveTrack { server_id: String, bot_index: usize, from: usize, to: usize },
    Previous { server_id: String, bot_index: usize },
    PlayIndex { server_id: String, bot_index: usize, index: usize },
    JoinChannel { server_id: String, channel_id: String, bot_index: usize, requester_id: Option<u64>, requester_name: Option<String> },
    LeaveChannel { server_id: String, bot_index: usize },
    SetVolume { server_id: String, bot_index: usize, volume: u8 },
    ToggleLoop { server_id: String, bot_index: usize },
    ShuffleQueue { server_id: String, bot_index: usize },
    DeduplicateQueue { server_id: String, bot_index: usize },
    SortQueue { server_id: String, bot_index: usize, mode: String },
    CastVote { server_id: String, bot_index: usize, voter_id: u64 },
    CancelVote { server_id: String, bot_index: usize },
    RollbackLastVote { server_id: String, bot_index: usize },
    DelegatePermission { server_id: String, bot_index: usize, caller_id: u64, target_id: u64 },
    RevokeDelegate { server_id: String, bot_index: usize, target_id: u64 },
}

// ============================================================ //
// ==== SHARED WEB APPLICATION STATE ========================== //
// ============================================================ //
#[derive(Clone)]
pub struct AppState {
    pub core_tx: mpsc::Sender<CoreMessage>,
    pub bots_state: Arc<RwLock<Vec<BotInstance>>>,
    pub db: Arc<DbRuntime>,
    pub tracks_preview: Arc<TracksPreview>,
    pub ws_rx: tokio::sync::watch::Receiver<std::collections::HashMap<String, PlayerState>>,
    pub discord_https: Vec<Arc<Http>>,
    pub lavalink_password: Arc<String>,
    pub local_tracks_dir: Arc<String>,
    pub docker_tracks_dir: Arc<String>,
    pub hivemind: Arc<musicbot_core::hivemind::HiveMind>,
    pub superadmin_ids: Arc<Vec<String>>,
    pub max_bots_per_channel: usize,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlayerCommand {
    pub server_id: String,
    pub bot_id: Option<usize>,
    pub action: String,
    pub payload: Option<String>,
    pub source: Option<String>, 
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponse {
    pub success: bool,
    pub message: String,
    pub results: Option<Value>, 
}

#[derive(Serialize)]
pub struct VoiceChannelInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub server_id: String,
    pub channel_id: String,
    pub bot_id: usize,
    pub track_name: String,
    pub author: String,
    pub progress_percent: u8,
    pub is_playing: bool,
    pub thumbnail_url: Option<String>,
    pub position_seconds: u64, 
    pub duration_seconds: u64,
    pub up_next: Vec<String>,
    pub history: Vec<String>,
    pub volume: u8,
    #[serde(rename = "isLooping")]
    pub is_looping: bool,
    pub is_radio_active: bool,
    pub owner_id: Option<String>,
    pub owner_name: Option<String>,
    pub delegated_user_ids: Vec<String>,
    pub active_vote: Option<VoteStateInfo>,
    pub has_rollback: bool,
    pub rollback_seconds_left: u64,
}
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VoteStateInfo {
    pub action: String,
    pub current_votes: usize,
    pub required_votes: usize,
    pub seconds_remaining: u64,
    pub initiated_by: String,
}

// ============================================================ //
// ==== WEB SERVER INITIALIZATION AND ROUTING (AXUM) ========== //
// ============================================================ //
pub async fn start_server(
    tx: mpsc::Sender<CoreMessage>, 
    bots_state: Arc<RwLock<Vec<BotInstance>>>,
    db: Arc<DbRuntime>,
    tracks_preview: Arc<TracksPreview>,
    ws_rx: tokio::sync::watch::Receiver<std::collections::HashMap<String, PlayerState>>,
    discord_https: Vec<Arc<Http>>,
    lavalink_pass: String,
    local_dir: String,
    docker_dir: String,
    hivemind: Arc<musicbot_core::hivemind::HiveMind>,
    discord_client_id: String,
    discord_client_secret: String,
    redirect_uri: String,
    superadmin_ids: Vec<String>,
    max_bots_per_channel: usize,
) {
    let cors = CorsLayer::new()
    .allow_origin("http://localhost:5173".parse::<axum::http::HeaderValue>().unwrap())
    .allow_methods(vec![
        axum::http::Method::GET,
        axum::http::Method::POST,
        axum::http::Method::OPTIONS,
    ])
    .allow_headers(vec![
        axum::http::header::CONTENT_TYPE,
        axum::http::header::AUTHORIZATION,
        axum::http::header::ACCEPT,
    ])
    .allow_credentials(true);
    let state = AppState { 
        core_tx: tx, bots_state, db, tracks_preview, ws_rx, discord_https,
        lavalink_password: Arc::new(lavalink_pass),
        local_tracks_dir: Arc::new(local_dir),
        docker_tracks_dir: Arc::new(docker_dir),
        hivemind,
        superadmin_ids: Arc::new(superadmin_ids),
        max_bots_per_channel,
    };

    let app = Router::new()
        .route("/api/search", get(search_local))
        .route("/api/bots", get(get_live_bots))
        .route("/api/system_bots/:server_id", get(get_system_bots)) 
        .route("/api/bots/:id/channels", get(get_bot_channels))
        .route("/api/command", post(webui::commands::handle_command))
        .route("/api/me/admin", get(check_admin))
        .route("/api/me/voice_channel/:server_id", get(get_my_voice_channel))
        .route("/ws", get(ws_handler))
        .with_state(state) 
        .nest("/api/auth", musicbot_auth::auth_router(
            discord_client_id, 
            discord_client_secret, 
            redirect_uri
        ))
        .fallback_service(ServeDir::new("./webui/dist"))
        .layer(CookieManagerLayer::new())
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("[WEBUI] API server and WebSocket service listening on port 3000");
    axum::serve(listener, app).await.unwrap();
}

// ============================================================ //
// ==== API: NODE AND PERMISSION MANAGEMENT =================== //
// ============================================================ //
async fn get_system_bots(
    Path(server_id): Path<String>,
    State(state): State<AppState>,
    cookies: Cookies,
) -> Json<Value> {
    let guild_id_u64 = server_id.parse::<u64>().unwrap_or(0);
    let user_id = cookies.get("mbv2_session").map(|c| c.value().to_string()).unwrap_or_default();
    let is_superadmin = state.superadmin_ids.contains(&user_id);
    
    let mut user_channel_id: Option<u64> = None;
    let user_id_u64 = user_id.parse::<u64>().unwrap_or(0);
    
    if let Some((u_guild, u_chan)) = state.hivemind.get_user_channel(user_id_u64).await {
        if u_guild == guild_id_u64 {
            user_channel_id = Some(u_chan);
        }
    }

    let mut bots_json = Vec::new();
    let bots_guard = state.hivemind.bots.read().await;

    for (i, bot) in bots_guard.iter() {
        let is_in_server = bot.guilds.contains(&guild_id_u64);

        let is_busy = matches!(bot.state, musicbot_core::hivemind::BotState::Busy { .. });
        
        let has_perm = is_superadmin || match bot.state {
            musicbot_core::hivemind::BotState::Busy { channel_id: b_c, .. } => user_channel_id == Some(b_c),
            _ => user_channel_id.is_some()
        };

        bots_json.push(serde_json::json!({
            "id": i,
            "name": bot.name,
            "avatarUrl": bot.avatar_url,
            "isBusy": is_busy,
            "isInServer": is_in_server,
            "userHasPermission": has_perm 
        }));
    }

    let bots_in_user_channel = if let Some(uc) = user_channel_id {
        state.hivemind.get_bots_in_channel(guild_id_u64, uc).await
    } else { 0 };

    serde_json::json!({
        "bots": bots_json,
        "currentChannelBotCount": bots_in_user_channel,
        "maxLimit": state.max_bots_per_channel
    }).into()
}

async fn get_bot_channels(
    Path(server_id): Path<String>,
    State(state): State<AppState>,
    _cookies: Cookies,
) -> Json<Vec<VoiceChannelInfo>> {
    let guild_id_u64 = server_id.parse::<u64>().unwrap_or(0);
    
    let cache = state.hivemind.guild_channels_cache.read().await;
    let mut channels: Vec<VoiceChannelInfo> = if let Some(cached_channels) = cache.get(&guild_id_u64) {
        cached_channels.iter().map(|(id, name)| VoiceChannelInfo {
            id: id.clone(),
            name: name.clone(),
        }).collect()
    } else {
        Vec::new()
    };

    channels.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Json(channels)
}

async fn get_live_bots(State(state): State<AppState>) -> Json<Vec<BotInstance>> {
    let bots_clone = {
        let guard = state.bots_state.read().await;
        guard.clone()
    };
    Json(bots_clone)
}

// ============================================================ //
// ==== WEBSOCKET CONNECTION MANAGEMENT ======================= //
// ============================================================ //
async fn ws_handler(
    ws: WebSocketUpgrade, 
    State(state): State<AppState>,
    cookies: Cookies,
) -> impl IntoResponse {
    let user_id = cookies.get("mbv2_session").map(|c| c.value().to_string()).unwrap_or_default();
    ws.on_upgrade(move |socket| handle_socket(socket, state, user_id))
}

async fn handle_socket(
    mut socket: WebSocket, 
    state: AppState, 
    user_id: String
) {
    let is_superadmin = state.superadmin_ids.contains(&user_id);
    let mut rx = state.ws_rx.clone();

    loop {
        tokio::select! {
            result = rx.changed() => {
                if result.is_err() { break; }
                let current_state = rx.borrow().clone();
                
                let msg = if is_superadmin || user_id.is_empty() {
                    serde_json::to_string(&current_state).unwrap()
                } else {
                    let mut allowed_state = std::collections::HashMap::new();
                    let user_id_u64 = user_id.parse::<u64>().unwrap_or(0);
                    let user_channel_info = state.hivemind.get_user_channel(user_id_u64).await;
                    
                    for (key, player) in current_state {
                        if let Some((u_guild, u_channel)) = user_channel_info {
                            if player.server_id == u_guild.to_string() 
                               && player.channel_id == u_channel.to_string() 
                            {
                                allowed_state.insert(key, player);
                            }
                        }
                    }
                    serde_json::to_string(&allowed_state).unwrap()
                };
                
                if socket.send(Message::Text(msg)).await.is_err() { break; }
            }

            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                            if val.get("type").and_then(|v| v.as_str()) == Some("ping") {
                                let pong = serde_json::json!({"type": "pong"}).to_string();
                                if socket.send(Message::Text(pong)).await.is_err() { break; }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}
async fn check_admin(State(state): State<AppState>, cookies: Cookies) -> Json<bool> {
    let user_id = cookies.get("mbv2_session").map(|c| c.value().to_string()).unwrap_or_default();
    Json(state.superadmin_ids.contains(&user_id))
}

// ============================================================ //
// ==== API: LOCAL SEARCH ===================================== //
// ============================================================ //
pub async fn search_local(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Json<Vec<Value>> {
    let mut out = Vec::new();
    
    match search(&state.tracks_preview, &params.q) { 
        SearchResult::Single { track_id } => {
            let title = state.tracks_preview.tracks.iter().find(|t| t.id == track_id)
                .map(|t| t.title.clone()).unwrap_or_else(|| track_id.clone());
            out.push(json!({ "track_id": track_id, "title": title, "index": 1 }));
        },
        SearchResult::Multiple { results } => {
            for r in results {
                out.push(json!({ "track_id": r.track_id, "title": r.title, "index": r.index }));
            }
        },
        SearchResult::NoMatch => {}
    }
    
    Json(out)
}
async fn get_my_voice_channel(
    Path(server_id): Path<String>,
    State(state): State<AppState>,
    cookies: Cookies,
) -> impl IntoResponse {
    let user_id_str = cookies.get("mbv2_session")
        .map(|c| c.value().to_string())
        .unwrap_or_default();
    let user_id_u64 = user_id_str.parse::<u64>().unwrap_or(0);
    let server_id_u64 = server_id.parse::<u64>().unwrap_or(0);

    if let Some((guild_id, channel_id)) = state.hivemind.get_user_channel(user_id_u64).await {
        if guild_id == server_id_u64 {
            let cache = state.hivemind.guild_channels_cache.read().await;
            if let Some(channels) = cache.get(&guild_id) {
                if let Some((id, name)) = channels.iter().find(|(cid, _)| {
                    cid.parse::<u64>().unwrap_or(0) == channel_id
                }) {
                    let channel = VoiceChannelInfo {
                        id: id.clone(),
                        name: name.clone(),
                    };
                    return axum::Json(serde_json::json!(channel)).into_response();
                }
            }
        }
    }

    axum::Json(serde_json::Value::Null).into_response()
}