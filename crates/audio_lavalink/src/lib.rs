use lavalink_rs::prelude::*;
use lavalink_rs::model::events::{Events, TrackEnd, TrackEndReason};
use lavalink_rs::model::UserId;

use musicbot_core::track::Track;
use serde_json::Value;

use serenity::model::id::GuildId;
use std::sync::OnceLock;
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::RwLock;

pub static TRACK_END_TX: OnceLock<UnboundedSender<(GuildId, u64)>> = OnceLock::new();

static INNERTUBE_CLIENT_VERSION: OnceLock<RwLock<String>> = OnceLock::new();
const INNERTUBE_FALLBACK_VERSION: &str = "2.20250530.01.00";

static RECENTLY_PLAYED: OnceLock<RwLock<std::collections::VecDeque<String>>> = OnceLock::new();
const RECENTLY_PLAYED_CAPACITY: usize = 10;

pub async fn was_recently_played(video_id: &str) -> bool {
    let lock = RECENTLY_PLAYED.get_or_init(|| RwLock::new(std::collections::VecDeque::new()));
    lock.read().await.contains(&video_id.to_string())
}

pub async fn mark_as_played(video_id: &str) {
    let lock = RECENTLY_PLAYED.get_or_init(|| RwLock::new(std::collections::VecDeque::new()));
    let mut deque = lock.write().await;
    deque.retain(|id| id != video_id);
    deque.push_back(video_id.to_string());
    while deque.len() > RECENTLY_PLAYED_CAPACITY {
        deque.pop_front();
    }
}

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

pub async fn fetch_innertube_client_version() -> String {
    let lock = INNERTUBE_CLIENT_VERSION.get_or_init(|| {
        RwLock::new(INNERTUBE_FALLBACK_VERSION.to_string())
    });

    {
        let cached = lock.read().await;
        if *cached != INNERTUBE_FALLBACK_VERSION {
            return cached.clone();
        }
    }

    let client = match reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            println!("[INNERTUBE] Failed to build HTTP client: {}", e);
            return INNERTUBE_FALLBACK_VERSION.to_string();
        }
    };

    let yt_home = {
        let https = std::str::from_utf8(&[104,116,116,112,115,58,47,47]).unwrap();
        let www   = std::str::from_utf8(&[119,119,119,46]).unwrap();
        let yt    = std::str::from_utf8(&[121,111,117,116,117,98,101,46,99,111,109]).unwrap();
        format!("{}{}{}", https, www, yt)
    };

    let version = match client.get(&yt_home).send().await {
        Ok(res) => match res.text().await {
            Ok(html) => {
                extract_innertube_version_from_html(&html).unwrap_or_else(|| {
                    println!("[INNERTUBE] Version string not found in HTML, using fallback");
                    INNERTUBE_FALLBACK_VERSION.to_string()
                })
            }
            Err(e) => {
                println!("[INNERTUBE] Failed to read YouTube homepage body: {}", e);
                INNERTUBE_FALLBACK_VERSION.to_string()
            }
        },
        Err(e) => {
            println!("[INNERTUBE] Failed to reach YouTube homepage: {}", e);
            INNERTUBE_FALLBACK_VERSION.to_string()
        }
    };

    {
        let mut cached = lock.write().await;
        *cached = version.clone();
        println!("[INNERTUBE] Client version resolved: {}", version);
    }

    version
}

fn extract_innertube_version_from_html(html: &str) -> Option<String> {
    let marker = {
        let key = std::str::from_utf8(&[
            73,78,78,69,82,84,85,66,69,95,
            67,76,73,69,78,84,95,86,69,82,83,73,79,78
        ]).unwrap();
        format!("\"{}\":\"", key)
    };
    let marker: &str = &marker;
    let start = html.find(marker)? + marker.len();
    let end = html[start..].find('"')? + start;
    let version = &html[start..end];
    if version.starts_with("2.") && version.len() > 10 {
        Some(version.to_string())
    } else {
        None
    }
}

pub fn extract_video_id_from_track_json(track_json: &str) -> Option<String> {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(track_json) {
        if let Some(uri) = val.pointer("/info/uri").and_then(|v| v.as_str()) {
            if let Some(id) = extract_video_id_from_url(uri) {
                return Some(id);
            }
        }
        if let Some(identifier) = val.pointer("/info/identifier").and_then(|v| v.as_str()) {
            if identifier.len() == 11 && identifier.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
                return Some(identifier.to_string());
            }
        }
        if let Some(uri) = val.get("uri").and_then(|v| v.as_str()) {
            if let Some(id) = extract_video_id_from_url(uri) {
                return Some(id);
            }
        }
    }
    extract_video_id_from_url(track_json)
}

fn extract_video_id_from_url(input: &str) -> Option<String> {
    let watch_plain   = std::str::from_utf8(&[119,97,116,99,104,63,118,61]).unwrap();
    let watch_encoded = std::str::from_utf8(&[119,97,116,99,104,37,51,70,118,37,51,68]).unwrap();
    let youtu_be      = std::str::from_utf8(&[121,111,117,116,117,46,98,101,47]).unwrap();

    if let Some(pos) = input.find(watch_plain).or_else(|| input.find(watch_encoded)) {
        let offset = if input[pos..].starts_with(watch_plain) { 8 } else { 12 };
        let start = pos + offset;
        let end = (start + 11).min(input.len());
        if end - start == 11 {
            return Some(input[start..end].to_string());
        }
    }
    if let Some(pos) = input.find(youtu_be) {
        let start = pos + 9;
        let end = (start + 11).min(input.len());
        if end - start == 11 {
            return Some(input[start..end].to_string());
        }
    }
    None
}

pub async fn get_related_video_id(video_id: &str) -> Option<String> {
    let client_version = fetch_innertube_client_version().await;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;

    let client_name = std::str::from_utf8(&[87,69,66]).unwrap();

    let payload = serde_json::json!({
        "videoId": video_id,
        "context": {
            "client": {
                "clientName": client_name,
                "clientVersion": client_version,
                "hl": "en",
                "gl": "US"
            }
        }
    });

    let endpoint = {
        let https = std::str::from_utf8(&[104,116,116,112,115,58,47,47]).unwrap();
        let www   = std::str::from_utf8(&[119,119,119,46]).unwrap();
        let yt    = std::str::from_utf8(&[121,111,117,116,117,98,101,46,99,111,109]).unwrap();
        let path  = std::str::from_utf8(&[47,121,111,117,116,117,98,101,105,47,118,49,47,110,101,120,116]).unwrap();
        format!("{}{}{}{}", https, www, yt, path)
    };
    let hdr_name = std::str::from_utf8(&[88,45,89,111,117,84,117,98,101,45,67,108,105,101,110,116,45,78,97,109,101]).unwrap();
    let hdr_ver  = std::str::from_utf8(&[88,45,89,111,117,84,117,98,101,45,67,108,105,101,110,116,45,86,101,114,115,105,111,110]).unwrap();

    let res = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header(hdr_name, "1")
        .header(hdr_ver, &client_version)
        .json(&payload)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        println!("[INNERTUBE] /next returned HTTP {}", res.status());
        return None;
    }

    let json: serde_json::Value = res.json().await.ok()?;

    let results = json
        .pointer("/contents/twoColumnWatchNextResults/secondaryResults/secondaryResults/results")
        .and_then(|v| v.as_array())?;

    /*for (i, item) in results.iter().take(3).enumerate() {
        println!("[INNERTUBE-DEBUG] results[{}] keys: {:?}", i,
            item.as_object().map(|o| o.keys().cloned().collect::<Vec<_>>()).unwrap_or_default()
        );
    }*/

    let mut candidates: Vec<String> = Vec::new();

    for item in results {
        if let Some(id) = item
            .pointer("/compactVideoRenderer/videoId")
            .and_then(|v| v.as_str())
        {
            candidates.push(id.to_string());
        }
        if let Some(id) = item
            .pointer("/lockupViewModel/contentId")
            .and_then(|v| v.as_str())
        {
            if id.len() == 11 {
                candidates.push(id.to_string());
            }
        }
        if let Some(contents) = item
            .pointer("/itemSectionRenderer/contents")
            .and_then(|v| v.as_array())
        {
            for inner in contents {
                if let Some(id) = inner
                    .pointer("/compactVideoRenderer/videoId")
                    .and_then(|v| v.as_str())
                {
                    candidates.push(id.to_string());
                }
                if let Some(id) = inner
                    .pointer("/lockupViewModel/contentId")
                    .and_then(|v| v.as_str())
                {
                    if id.len() == 11 {
                        candidates.push(id.to_string());
                    }
                }
            }
        }
        if candidates.len() >= 10 {
            break;
        }
    }

    for candidate in &candidates {
        if candidate == video_id {
            continue;
        }
        if !was_recently_played(candidate).await {
            println!("[INNERTUBE] Related video selected: {}", candidate);
            return Some(candidate.clone());
        }
    }

    for candidate in &candidates {
        if candidate != video_id {
            println!("[INNERTUBE] All candidates recently played, reusing: {}", candidate);
            return Some(candidate.clone());
        }
    }

    println!("[INNERTUBE] No related video found for: {}", video_id);
    None
}

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
            "track": { "encoded": serde_json::Value::Null }
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

        let payload = serde_json::json!({ "volume": volume as u16 });

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