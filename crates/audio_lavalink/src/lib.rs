use lavalink_rs::prelude::*;
use lavalink_rs::model::events::{Events, TrackEnd, TrackEndReason};
use lavalink_rs::model::UserId;

use musicbot_core::track::Track;
use serde_json::Value;

use serenity::model::id::GuildId;
use std::sync::OnceLock;
use tokio::sync::mpsc::UnboundedSender;

// ==== GLOBAL FEEDBACK EVENT CHANNEL ====================== //
pub static TRACK_END_TX: OnceLock<UnboundedSender<(GuildId, u64)>> = OnceLock::new();

// ============================================================ //
// ==== WEBSOCKET EVENT HANDLING (LAVALINK TRACK-END) ======== //
// ============================================================ //
fn track_end(
    client: LavalinkClient,
    _session_id: String,
    event: &TrackEnd,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
    let guild_id = event.guild_id;
    let reason = event.reason.clone(); 
    let bot_user_id = client.nodes.first().map(|n| n.user_id.0).unwrap_or(0);

    Box::pin(async move {
        if reason == TrackEndReason::Finished || reason == TrackEndReason::LoadFailed {
            if let Some(tx) = TRACK_END_TX.get() {
                let serenity_guild_id = serenity::model::id::GuildId::new(guild_id.0); 
                let _ = tx.send((serenity_guild_id, bot_user_id));
            }
        }
    })
}

// ============================================================ //
// ==== TRACK SEARCH AND METADATA API (REST) ========== //
// ============================================================ //
pub async fn resolve_tracks(identifier: &str, password: &str) -> Option<Vec<Track>> {
    let client = reqwest::Client::new();
    let url = reqwest::Url::parse_with_params(
        "http://lavalink:2333/v4/loadtracks",
        &[("identifier", identifier)]
    ).ok()?;
    
    let res = client.get(url).header("Authorization", password).send().await.ok()?;
    let json: Value = res.json().await.ok()?;
    let load_type = json.get("loadType")?.as_str()?;
    
    let mut tracks_data = Vec::new();
    if load_type == "track" {
        if let Some(d) = json.get("data") { tracks_data.push(d.clone()); }
    } else if load_type == "search" {
        if let Some(d) = json.get("data")?.as_array()?.first() { tracks_data.push(d.clone()); }
    } else if load_type == "playlist" {
        if let Some(arr) = json.get("data")?.get("tracks")?.as_array() {
            for t in arr { tracks_data.push(t.clone()); }
        }
    } else {
        return None;
    }

    let mut result = Vec::new();
    for track_data in tracks_data {
        let encoded = track_data.get("encoded")?.as_str()?.to_string();
        let track_json = track_data.to_string(); 
        
        let info = track_data.get("info")?;
        let title = info.get("title")?.as_str()?.to_string();
        let length_sec = info.get("length")?.as_u64()? / 1000;

        result.push(Track::lavalink(encoded, title, length_sec, track_json));
    }

    if result.is_empty() { None } else { Some(result) }
}

// ============================================================ //
// ==== MAIN CLIENT STRUCTURE (BACKEND) =================== //
// ============================================================ //
#[derive(Clone)]
pub struct LavalinkBackend {
    pub client: LavalinkClient,
    password: String,
}

impl LavalinkBackend {
    pub async fn new(bot_id: u64, password: &str) -> Self {
        let node = NodeBuilder {
            hostname: "lavalink:2333".to_string(),
            password: password.to_string(),
            user_id: UserId(bot_id),
            ..Default::default()
        };

        let events = Events {
            track_end: Some(track_end),
            ..Default::default()
        };

        let client = LavalinkClient::new(
            events,
            vec![node],
            NodeDistributionStrategy::default()
        ).await;

        Self { client, password: password.to_string() }
    }

    // ============================================================ //
    // ==== PLAYBACK CONTROL API (HTTP PATCH / WSS) ======== //
    // ============================================================ //
    pub async fn pause(&self, guild_id: GuildId) {
        let update = lavalink_rs::model::http::UpdatePlayer {
            paused: Some(true),
            ..Default::default()
        };
        let _ = self.client.update_player(guild_id.get(), &update, false).await;
    }

    pub async fn resume(&self, guild_id: GuildId) {
        let update = lavalink_rs::model::http::UpdatePlayer {
            paused: Some(false),
            ..Default::default()
        };
        let _ = self.client.update_player(guild_id.get(), &update, false).await;
    }

    pub async fn seek(&self, guild_id: GuildId, position_ms: u64) {
        let update = lavalink_rs::model::http::UpdatePlayer {
            position: Some(position_ms),
            ..Default::default()
        };
        let _ = self.client.update_player(guild_id.get(), &update, false).await;
    }

    pub async fn delete_player(&self, guild_id: GuildId) {
        let _ = self.client.delete_player(guild_id.get()).await;
        println!("[LAVALINK] Destroyed player node for server: {}", guild_id);
    }

    pub async fn stop(&self, guild_id: GuildId) {
        let lavalink_session_id = self.client.nodes.first()
            .and_then(|node| {
                let id_arc = node.session_id.load_full();
                if id_arc.is_empty() { None } else { Some((*id_arc).clone()) }
            })
            .unwrap_or_default();

        let payload = serde_json::json!({
            "track": {
                "encoded": serde_json::Value::Null
            }
        });

        let url = format!("http://lavalink:2333/v4/sessions/{}/players/{}", lavalink_session_id, guild_id.get());
        let http_client = reqwest::Client::new();
        
        let _ = http_client.patch(&url)
            .header("Authorization", &self.password)
            .json(&payload)
            .send()
            .await;
            
        println!("[LAVALINK] Stopped audio streaming (tunnel maintained)");
    }

    pub async fn set_volume(&self, guild_id: GuildId, volume: u8) {
        let lavalink_session_id = self.client.nodes.first()
            .and_then(|node| {
                let id_arc = node.session_id.load_full();
                if id_arc.is_empty() { None } else { Some((*id_arc).clone()) }
            })
            .unwrap_or_default();

        let payload = serde_json::json!({
            "volume": volume as u16
        });

        let url = format!("http://lavalink:2333/v4/sessions/{}/players/{}", lavalink_session_id, guild_id.get());
        let http_client = reqwest::Client::new();
        
        let _ = http_client.patch(&url)
            .header("Authorization", &self.password)
            .json(&payload)
            .send()
            .await;
    }

    pub async fn get_position(&self, guild_id: GuildId) -> Option<u64> {
        let lavalink_session_id = self.client.nodes.first()
            .and_then(|node| {
                let id_arc = node.session_id.load_full();
                if id_arc.is_empty() { None } else { Some((*id_arc).clone()) }
            })
            .unwrap_or_default();

        let url = format!("http://lavalink:2333/v4/sessions/{}/players/{}", lavalink_session_id, guild_id.get());
        let http_client = reqwest::Client::new();
        
        let res = http_client.get(&url)
            .header("Authorization", &self.password)
            .send()
            .await.ok()?;

        if res.status().is_success() {
            let json: serde_json::Value = res.json().await.ok()?;
            let position_ms = json.get("state")?.get("position")?.as_u64()?;
            Some(position_ms / 1000)
        } else {
            None
        }
    }

    pub async fn play(&self, guild_id: GuildId, track_json: &str) {
        if let Ok(track_data) = serde_json::from_str::<lavalink_rs::model::track::TrackData>(track_json) {
            let player_track = lavalink_rs::model::http::UpdatePlayerTrack {
                encoded: Some(track_data.encoded),
                identifier: None,
                user_data: None,
            };

            let update = lavalink_rs::model::http::UpdatePlayer {
                track: Some(player_track),
                ..Default::default()
            };
            
            let _ = self.client.update_player(guild_id.get(), &update, false).await;
            println!("[LAVALINK] Forwarded PLAY command to audio engine");
        }
    }

    // ============================================================ //
    // ==== DISCORD VOICE GATEWAY INTEGRATION ==================== //
    // ============================================================ //
    pub async fn provide_voice_state(&self, guild_id: GuildId, channel_id: u64, session_id: String, token: String, endpoint: String) {
        let lavalink_session_id: String = self.client.nodes.first()
            .and_then(|node| {
                let id_arc = node.session_id.load_full();
                if id_arc.is_empty() { None } else { Some((*id_arc).clone()) }
            })
            .unwrap_or_default();

        if lavalink_session_id.is_empty() {
            println!("[LAVALINK-ERR] Missing active session_id, aborting voice authorization");
            return;
        }

        let payload = serde_json::json!({
            "voice": {
                "token": token,
                "endpoint": endpoint,
                "sessionId": session_id,
                "channelId": channel_id.to_string()
            }
        });

        let url = format!("http://lavalink:2333/v4/sessions/{}/players/{}", lavalink_session_id, guild_id.get());
        let http_client = reqwest::Client::new();
        
        let res = http_client.patch(&url)
            .header("Authorization", &self.password)
            .json(&payload)
            .send()
            .await;

        match res {
            Ok(r) if r.status().is_success() => println!("[LAVALINK] Voice authorized successfully (200 OK)"),
            Ok(r) => println!("[LAVALINK-ERR] Voice authorization rejected: {}", r.status()),
            Err(e) => println!("[LAVALINK-ERR] HTTP communication error: {:?}", e),
        }
    }
}