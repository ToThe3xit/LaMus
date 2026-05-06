// ============================================================ //
// ==== SEARCH SESSION MANAGEMENT (CACHE) ===================== //
// ============================================================ //
use std::collections::HashMap;
use std::time::{Duration, Instant};
use serenity::model::prelude::{ChannelId, UserId};

use crate::search::ScoredTrack;

#[derive(Debug)]
pub struct SearchSession {
    pub user_id: UserId,
    pub channel_id: ChannelId,
    pub results: Vec<ScoredTrack>,
    pub created_at: Instant,
}

pub struct SearchSessionStore {
    sessions: HashMap<(UserId, ChannelId), SearchSession>,
}

impl SearchSessionStore {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn create(
        &mut self,
        user_id: UserId,
        channel_id: ChannelId,
        results: Vec<ScoredTrack>,
    ) {
        let key = (user_id, channel_id);

        let session = SearchSession {
            user_id,
            channel_id,
            results,
            created_at: Instant::now(),
        };

        self.sessions.insert(key, session);
    }

    pub fn get(
        &self,
        user_id: UserId,
        channel_id: ChannelId,
    ) -> Option<&SearchSession> {
        self.sessions.get(&(user_id, channel_id))
    }

    pub fn remove(
        &mut self,
        user_id: UserId,
        channel_id: ChannelId,
    ) {
        self.sessions.remove(&(user_id, channel_id));
    }

    pub fn cleanup_expired(&mut self, max_age: Duration) {
        let now = Instant::now();

        self.sessions.retain(|_, session| {
            now.duration_since(session.created_at) <= max_age
        });
    }
}