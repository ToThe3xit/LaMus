use std::collections::{HashMap, HashSet};
use tokio::sync::RwLock;
use serde_json;

#[derive(Debug, Clone, PartialEq)]
pub enum BotState {
    Idle,
    Reserved { user_id: u64, guild_id: u64 },
    Busy { guild_id: u64, channel_id: u64 },
}

#[derive(Debug, Clone)]
pub struct BotRecord {
    pub index: usize,
    pub state: BotState,
    pub name: String,
    pub avatar_url: String,
    pub guilds: HashSet<u64>,
}

#[derive(Debug, Clone)]
pub struct CachedPlayerState {
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
    pub is_looping: bool,
    pub is_radio_active: bool,
    pub owner_id: Option<String>,
    pub owner_name: Option<String>,
    pub delegated_user_ids: Vec<String>,
    pub active_vote: Option<crate::governance::VoteStateInfo>,
    pub has_rollback: bool,
    pub rollback_seconds_left: u64,
}

pub struct HiveMind {
    pub bots: RwLock<HashMap<usize, BotRecord>>,
    pub user_voice_states: RwLock<HashMap<u64, (u64, u64)>>,
    pub text_command_locks: RwLock<HashMap<String, usize>>,
    pub player_states: RwLock<HashMap<usize, CachedPlayerState>>,
    pub discord_ids: RwLock<HashMap<u64, usize>>,
    pub guild_channels_cache: RwLock<HashMap<u64, Vec<(String, String)>>>,
    pub prefetched_radio: RwLock<HashMap<usize, String>>,
    pub governance: crate::governance::SessionGovernance,
    pub superadmin_ids: Vec<String>,
    pub bot_discord_ids: RwLock<HashMap<u64, usize>>,
}

impl HiveMind {
    pub fn new(bot_count: usize) -> Self {
        Self::new_with_governance(bot_count, 50, 15, Vec::new())
    }

    pub fn new_with_governance(
        bot_count: usize,
        vote_pct: u8,
        vote_timeout: u64,
        superadmin_ids: Vec<String>,
    ) -> Self {
        let mut bots = HashMap::new();
        for i in 0..bot_count {
            bots.insert(i, BotRecord {
                index: i,
                state: BotState::Idle,
                name: format!("Bot #{}", i),
                avatar_url: "".into(),
                guilds: HashSet::new(),
            });
        }
        Self {
            bots: RwLock::new(bots),
            user_voice_states: RwLock::new(HashMap::new()),
            text_command_locks: RwLock::new(HashMap::new()),
            player_states: RwLock::new(HashMap::new()),
            discord_ids: RwLock::new(HashMap::new()),
            guild_channels_cache: RwLock::new(HashMap::new()),
            prefetched_radio: RwLock::new(HashMap::new()),
            governance: crate::governance::SessionGovernance::new(vote_pct, vote_timeout),
            superadmin_ids,
            bot_discord_ids: RwLock::new(HashMap::new()),
        }
    }

    // --- USERS ---
    pub async fn get_user_channel(&self, user_id: u64) -> Option<(u64, u64)> {
        self.user_voice_states.read().await.get(&user_id).cloned()
    }

    pub async fn update_user_voice_state(&self, user_id: u64, guild_id: u64, channel_id: Option<u64>) {
        let mut states = self.user_voice_states.write().await;
        match channel_id {
            Some(cid) => states.insert(user_id, (guild_id, cid)),
            None => states.remove(&user_id),
        };
    }

    // --- BOTS ---
    pub async fn get_bot_state(&self, bot_index: usize) -> BotState {
        self.bots.read().await.get(&bot_index).map(|b| b.state.clone()).unwrap_or(BotState::Idle)
    }

    pub async fn set_bot_state(&self, bot_index: usize, state: BotState) {
        if let Some(bot) = self.bots.write().await.get_mut(&bot_index) {
            bot.state = state;
        }
    }

    pub async fn get_bots_in_channel(&self, target_guild: u64, target_channel: u64) -> usize {
        self.bots.read().await.values().filter(|b| match b.state {
            BotState::Busy { guild_id, channel_id } => guild_id == target_guild && channel_id == target_channel,
            _ => false,
        }).count()
    }

    pub async fn get_all_busy_bots(&self) -> Vec<(usize, u64, u64)> {
        self.bots.read().await.values().filter_map(|b| match b.state {
            BotState::Busy { guild_id, channel_id } => Some((b.index, guild_id, channel_id)),
            _ => None,
        }).collect()
    }

    // --- TEMPORARY LOCKS FOR TEXT COMMANDS ---
    pub async fn try_lock_action(&self, key: String, bot_index: usize) -> bool {
        let mut locks = self.text_command_locks.write().await;
        if locks.contains_key(&key) { return false; }
        locks.insert(key, bot_index);
        true
    }

    pub async fn unlock_action(&self, key: &str) {
        self.text_command_locks.write().await.remove(key);
    }
    
    pub async fn is_action_locked_by_me(&self, key: &str, bot_index: usize) -> bool {
        self.text_command_locks.read().await.get(key) == Some(&bot_index)
    }
    
    pub async fn is_bot_assigned_to_action(&self, bot_index: usize) -> bool {
        self.text_command_locks.read().await.values().any(|&v| v == bot_index)
    }
    
    // --- RAM FOR PLAYER STATE (CACHE) ---
    pub async fn get_cached_state(&self, bot_index: usize) -> Option<CachedPlayerState> {
        self.player_states.read().await.get(&bot_index).cloned()
    }

    pub async fn update_cached_state(&self, bot_index: usize, state: CachedPlayerState) {
        self.player_states.write().await.insert(bot_index, state);
    }

    pub async fn register_bot_discord_id(&self, discord_id: u64, bot_index: usize) {
        self.discord_ids.write().await.insert(discord_id, bot_index);
        self.bot_discord_ids.write().await.insert(discord_id, bot_index);
        println!("[HIVEMIND] Registered bot identity: Index {} = Discord ID {}", bot_index, discord_id);
    }

    pub async fn find_bot_by_discord_id(&self, discord_id: u64) -> Option<usize> {
        self.discord_ids.read().await.get(&discord_id).copied()
    }
    
    pub async fn get_web_bot_list(&self) -> Vec<serde_json::Value> {
        let bots = self.bots.read().await;
        let mut result = Vec::new();
        
        for (index, record) in bots.iter() {
            let (is_busy, in_server) = match record.state {
                BotState::Busy { .. } => (true, true),
                BotState::Idle => (false, true),
                _ => (false, false),
            };

            result.push(serde_json::json!({
                "id": index,
                "name": record.name,
                "avatarUrl": record.avatar_url,
                "isBusy": is_busy,
                "isInServer": in_server
            }));
        }
        result
    }
    
    pub async fn update_bot_metadata(&self, bot_index: usize, name: String, avatar: String) {
        if let Some(bot) = self.bots.write().await.get_mut(&bot_index) {
            bot.name = name;
            bot.avatar_url = avatar;
        }
    }

    pub async fn register_bot_guild(&self, bot_index: usize, guild_id: u64) {
        if let Some(bot) = self.bots.write().await.get_mut(&bot_index) {
            bot.guilds.insert(guild_id);
        }
    }
    
    pub async fn unregister_bot_guild(&self, bot_index: usize, guild_id: u64) {
        if let Some(bot) = self.bots.write().await.get_mut(&bot_index) {
            bot.guilds.remove(&guild_id);
        }
    }
    pub async fn get_channel_human_members(&self, guild_id: u64, channel_id: u64) -> Vec<u64> {
    self.user_voice_states.read().await
        .iter()
        .filter(|(_, (g, c))| *g == guild_id && *c == channel_id)
        .map(|(uid, _)| *uid)
        .collect()
    }
    pub async fn is_bot_discord_id(&self, discord_id: u64) -> bool {
        self.discord_ids.read().await.contains_key(&discord_id)
    }
}