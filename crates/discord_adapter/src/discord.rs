pub mod commands;

use serenity::async_trait;
use serenity::model::gateway::Ready;
use serenity::prelude::*;
use serenity::model::prelude::*;
use serenity::Client;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

use musicbot_core::engine::CoreState;
use musicbot_core::command::Command;
use musicbot_core::BotInstance;

use crate::adapter::DiscordAudioAdapter;
use crate::db_runtime::DbRuntime;
use crate::search::TracksPreview;
use crate::search_session::SearchSessionStore;

use musicbot_core::hivemind::HiveMind;

pub enum ObserverMessage {
    Search { guild_id: u64, voice_channel_id: u64, text_channel_id: u64, bot_index: usize, query: String },
    SearchLocal { guild_id: u64, voice_channel_id: u64, text_channel_id: u64, bot_index: usize, query: String },
    Action { guild_id: u64, text_channel_id: u64, bot_index: usize, action: String },
}

pub struct ObserverHandler {
    pub hivemind: Arc<HiveMind>,
    pub obs_tx: tokio::sync::mpsc::UnboundedSender<ObserverMessage>,
    pub bot_count: usize,
}

#[async_trait]
impl EventHandler for ObserverHandler {
    async fn ready(&self, ctx: Context, ready: Ready) {
        println!("[OBSERVER] Logged in as main controller: {}", ready.user.name);

        let commands = vec![
            serenity::all::CreateCommand::new("search")
                .description("Search and play track from network")
                .add_option(serenity::all::CreateCommandOption::new(
                    serenity::all::CommandOptionType::String,
                    "query",
                    "Link or track name",
                ).required(true)),
            serenity::all::CreateCommand::new("searchlocal")
                .description("Search for a track in local database")
                .add_option(serenity::all::CreateCommandOption::new(
                    serenity::all::CommandOptionType::String,
                    "query",
                    "File name",
                ).required(true)),
            serenity::all::CreateCommand::new("skip").description("Skip current track"),
            serenity::all::CreateCommand::new("leave").description("Disconnect bot and clear queue"),
            serenity::all::CreateCommand::new("queue").description("Show current queue"),
            serenity::all::CreateCommand::new("pause").description("Pause playback"),
            serenity::all::CreateCommand::new("resume").description("Resume playback"),
            serenity::all::CreateCommand::new("clear").description("Clear queue"),
        ];

        if let Err(e) = serenity::all::Command::set_global_commands(&ctx.http, commands).await {
            println!("[OBSERVER] Error registering slash commands: {:?}", e);
        } else {
            println!("[OBSERVER] Slash commands registered successfully.");
        }

    }

    async fn interaction_create(&self, ctx: Context, interaction: Interaction) {
        if let Interaction::Command(command) = interaction {
            crate::discord::commands::handle_interaction(&ctx, &command, &self.hivemind, &self.obs_tx, self.bot_count).await;
        }
    }
    async fn guild_create(&self, _ctx: Context, guild: Guild, _is_new: Option<bool>) {
        for (user_id, voice_state) in &guild.voice_states {
            if let Some(channel_id) = voice_state.channel_id {
                self.hivemind.update_user_voice_state(
                    user_id.get(),
                    guild.id.get(),
                    Some(channel_id.get())
                ).await;
            }
        }
        let voice_channels: Vec<(String, String)> = guild.channels
            .values()
            .filter(|c| c.kind == serenity::model::channel::ChannelType::Voice)
            .map(|c| (c.id.get().to_string(), c.name.clone()))
            .collect();
        
        self.hivemind.guild_channels_cache.write().await.insert(guild.id.get(), voice_channels);
        println!("[OBSERVER] Buffered {} channels for server: {}", guild.channels.len(), guild.name);
    }
    async fn voice_state_update(&self, _ctx: Context, old: Option<VoiceState>, new: VoiceState) {
        if let Some(guild_id) = new.guild_id {
            self.hivemind.update_user_voice_state(
                new.user_id.get(), 
                guild_id.get(), 
                new.channel_id.map(|c| c.get())
            ).await;
        }
        
        if let Some(guild_id) = old.as_ref().and_then(|s| s.guild_id).or(new.guild_id) {
            let user_id = new.user_id.get();
            
            if let Some(bot_index) = self.hivemind.find_bot_by_discord_id(user_id).await {
                if let Some(channel_id) = new.channel_id {
                    self.hivemind.set_bot_state(bot_index, musicbot_core::hivemind::BotState::Busy { 
                        guild_id: guild_id.get(), 
                        channel_id: channel_id.get() 
                    }).await;
                } else {
                    self.hivemind.set_bot_state(bot_index, musicbot_core::hivemind::BotState::Idle).await;
                }
            }
        }
    } 
}
pub async fn start_observer(
    token: String,
    hivemind: Arc<HiveMind>,
    obs_tx: tokio::sync::mpsc::UnboundedSender<ObserverMessage>,
    bot_count: usize,
) {
    let intents = GatewayIntents::GUILDS | GatewayIntents::GUILD_VOICE_STATES;
    let mut client = Client::builder(token, intents)
        .event_handler(ObserverHandler { hivemind, obs_tx, bot_count })
        .await
        .expect("Error creating Observer");

    println!("[OBSERVER] Big Brother started listening to voice channels.");
    if let Err(why) = client.start().await {
        println!("Observer error: {:?}", why);
    }
}
// ============================================================ //
// ==== INTERNAL COMMANDS (WEBUI -> DISCORD) ================== //
// ============================================================ //
pub enum WebDiscordCommand {
    Join(GuildId, ChannelId),
    Leave(GuildId),
    CheckPerms(GuildId, serenity::model::id::UserId, tokio::sync::oneshot::Sender<bool>),
    GetUserChannel(GuildId, serenity::model::id::UserId, tokio::sync::oneshot::Sender<Option<String>>),
}

// ============================================================ //
// ==== DISCORD EVENT HANDLER STRUCTURE ======================= //
// ============================================================ //
#[derive(Clone)]
pub struct Handler {
    pub search_sessions: Arc<Mutex<SearchSessionStore>>,
    pub tracks_preview: Arc<TracksPreview>,
    pub core: Arc<Mutex<CoreState>>,
    pub audio: Arc<Mutex<DiscordAudioAdapter>>,
    pub active_voice_channel: Arc<Mutex<Option<ChannelId>>>,
    pub db: Arc<DbRuntime>,
    pub web_state: Arc<RwLock<Vec<BotInstance>>>,
    pub auto_leave_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    pub lavalink_password: Arc<String>,
    pub local_tracks_dir: Arc<String>,
    pub docker_tracks_dir: Arc<String>,
    pub default_volume: u8,
    pub songbird: Arc<songbird::Songbird>,
    pub bot_index: usize,
    pub hivemind: Arc<HiveMind>,
    pub max_bots_per_channel: usize,
}

// ============================================================ //
// ==== EVENT HANDLING IMPLEMENTATION (GATEWAY) =============== //
// ============================================================ //
#[async_trait]
impl EventHandler for Handler {
    async fn ready(&self, _: Context, ready: Ready) {
        println!("[DISCORD] Connected to gateway: {}", ready.user.name);
        self.hivemind.register_bot_discord_id(ready.user.id.get(), self.bot_index).await;

        let avatar = ready.user.avatar_url().unwrap_or_else(|| "https://cdn.discordapp.com/embed/avatars/0.png".to_string());
        self.hivemind.update_bot_metadata(self.bot_index, ready.user.name.clone(), avatar).await;

        println!("[DISCORD] WebUI interface state initialized");
    }

    async fn guild_create(&self, _ctx: Context, guild: Guild, _is_new: Option<bool>) {
        let mut state = self.web_state.write().await;
        if !state.iter().any(|b| b.id == guild.id.get().to_string()) {
            state.push(BotInstance {
                id: guild.id.get().to_string(),
                server_name: guild.name.clone(),
                is_locked: false,
                status: "idle".into(),
                icon_url: guild.icon_url(),
            });
        }  
        
        self.hivemind.register_bot_guild(self.bot_index, guild.id.get()).await;
    }

    async fn guild_delete(&self, _ctx: Context, incomplete: UnavailableGuild, _full: Option<Guild>) {
        self.hivemind.unregister_bot_guild(self.bot_index, incomplete.id.get()).await;
    }

    async fn message(&self, _ctx: Context, _msg: Message) {
        //MIGRATED
    }

    // ============================================================ //
    // ==== CHANNEL MONITORING SYSTEM (AUTO-LEAVE) ================ //
    // ============================================================ //
    async fn voice_state_update(
        &self,
        ctx: Context,
        old: Option<VoiceState>,
        new: VoiceState,
    ) {
        let Some(guild_id) = new.guild_id else { return; };
        let bot_id = ctx.cache.current_user().id;

        if new.user_id == bot_id {
            if let Some(new_channel_id) = new.channel_id {
                let channel_changed = old.as_ref().map_or(true, |o| o.channel_id != Some(new_channel_id));
                
                if channel_changed {
                    {
                        let mut active = self.active_voice_channel.lock().await;
                        *active = Some(new_channel_id);
                    }
                    
                    println!("[DISCORD] Voice channel change detected (Bot #{})", self.bot_index);
                }
            }
        }

        if new.user_id == bot_id && new.channel_id.is_none() {
            println!("[DISCORD] Disconnected from voice channel. Releasing resources...");
            crate::discord::disconnect_bot(&ctx, guild_id, self).await;
            return;
        }

        let mut active_channel_opt = { *self.active_voice_channel.lock().await };
        if active_channel_opt.is_none() && new.user_id == bot_id {
            active_channel_opt = new.channel_id;
        }
        let Some(active_channel) = active_channel_opt else { return; };

        let users_on_channel = if let Some(guild) = ctx.cache.guild(guild_id) {
            guild.voice_states
                .iter()
                .filter(|(uid, vs)| {
                    if vs.channel_id != Some(active_channel) { return false; }
                    if **uid == bot_id { return false; }
                    let is_bot = guild.members.get(uid).map(|m| m.user.bot).unwrap_or(false);
                    !is_bot
                })
                .count()
        } else {
            0
        };

        if users_on_channel == 0 {
            println!("[DISCORD] No active listeners. Initializing auto-leave procedure (300s)...");
            let mut task_lock = self.auto_leave_task.lock().await;
            
            if task_lock.is_none() {
                let handler_clone = self.clone();
                let ctx_clone = ctx.clone();
                
                let task = tokio::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
                    println!("[DISCORD] Idle time expired. Terminating session.");
                    disconnect_bot(&ctx_clone, guild_id, &handler_clone).await;
                });
                *task_lock = Some(task);
            }
        } else {
            let mut task_lock = self.auto_leave_task.lock().await;
            if let Some(task) = task_lock.take() {
                task.abort();
                println!("[DISCORD] User activity detected. Canceling auto-leave procedure.");
            }
        }
    }

    async fn voice_server_update(&self, ctx: Context, update: VoiceServerUpdateEvent) {
        let bot_id = ctx.cache.current_user().id;
        
        let Some(guild_id) = update.guild_id else { return; };
        let Some(endpoint) = update.endpoint else { return; };

        let voice_info = {
            if let Some(guild) = ctx.cache.guild(guild_id) {
                if let Some(vs) = guild.voice_states.get(&bot_id) {
                    if let Some(channel_id) = vs.channel_id {
                        Some((channel_id.get(), vs.session_id.clone()))
                    } else { None }
                } else { None }
            } else { None }
        };

        if let Some((channel_id_u64, session_id)) = voice_info {
            let audio_lock = self.audio.lock().await;
            
            audio_lock.backend.provide_voice_state(
                guild_id,
                channel_id_u64,
                session_id,
                update.token,
                endpoint
            ).await;
            
            println!("[ADAPTER] Audio session parameters updated (Bot #{})", self.bot_index);
        }
    }
}

// ============================================================ //
// ==== VOICE SESSION MANAGEMENT FUNCTIONS ==================== //
// ============================================================ //
pub async fn disconnect_bot(ctx: &Context, guild_id: GuildId, handler: &Handler) {
    println!("[DISCORD] Initializing disconnect...");
    {
        let mut active = handler.active_voice_channel.lock().await;
        *active = None;
    }

    {
        let audio_lock = handler.audio.lock().await;
        audio_lock.backend.delete_player(guild_id).await;
    }

    let events = {
        let mut core = handler.core.lock().await;
        let evs = core.handle_command(Command::Clear);
        core.playback.volume = handler.default_volume;
        evs
    };

    commands::process_core_events(guild_id, events, handler.audio.clone()).await;

    let mut state = handler.web_state.write().await;
    if let Some(bot) = state.iter_mut().find(|b| b.id == guild_id.get().to_string()) {
        bot.status = "idle".into();
        bot.is_locked = false; 
    }

    if let Some(manager) = songbird::get(ctx).await {
        let _ = manager.leave(guild_id).await;
    }
    let _ = handler.songbird.leave(guild_id).await;
}

pub async fn join_voice_channel(
    _ctx: &Context,
    guild_id: GuildId,
    channel_id: ChannelId,
    handler: &Handler,
) -> Result<(), &'static str> {
    let manager = handler.songbird.clone();
    if let Ok((conn_info, _)) = manager.join_gateway(guild_id, channel_id).await {
        println!("[DISCORD] Voice connection established. Authorizing audio node...");
        
        let mut active = handler.active_voice_channel.lock().await;
        *active = Some(channel_id);

        let audio_lock = handler.audio.lock().await;
        audio_lock.backend.provide_voice_state(
            guild_id, 
            channel_id.get(),
            conn_info.session_id, 
            conn_info.token, 
            conn_info.endpoint
        ).await;

        let current_vol = { handler.core.lock().await.playback.volume };
        audio_lock.backend.set_volume(guild_id, current_vol).await;
        
        let mut state = handler.web_state.write().await;
        if let Some(bot) = state.iter_mut().find(|b| b.id == guild_id.get().to_string()) {
            bot.is_locked = true; 
        }
        Ok(())
    } else {
        Err("Failed to connect to the voice channel.")
    }
}

// ============================================================ //
// ==== DISCORD CLIENT INITIALIZATION (ENTRY POINT) =========== //
// ============================================================ //
pub async fn start_discord(
    token: String, 
    web_state: Arc<RwLock<Vec<BotInstance>>>,
    core: Arc<Mutex<CoreState>>,
    audio: Arc<Mutex<DiscordAudioAdapter>>,
    db: Arc<DbRuntime>,
    tracks_preview: Arc<TracksPreview>,
    mut web_cmd_rx: tokio::sync::mpsc::UnboundedReceiver<crate::discord::WebDiscordCommand>,
    lavalink_password: String, 
    local_tracks_dir: String,  
    docker_tracks_dir: String, 
    default_volume: u8,
    bot_index: usize,
    hivemind: Arc<HiveMind>,
    max_bots_per_channel: usize,       
) {
    let intents = GatewayIntents::GUILDS | GatewayIntents::GUILD_MESSAGES | GatewayIntents::MESSAGE_CONTENT | GatewayIntents::GUILD_VOICE_STATES;

    let _core_clone = core.clone();
    let _audio_clone = audio.clone();
    let _db_clone = db.clone();
    let _tracks_preview_clone = tracks_preview.clone();

    let arc_pass = Arc::new(lavalink_password);
    let arc_local = Arc::new(local_tracks_dir);
    let arc_docker = Arc::new(docker_tracks_dir);

    let _pass_clone = arc_pass.clone();
    let _local_clone = arc_local.clone();
    let _docker_clone = arc_docker.clone();

    let songbird = songbird::Songbird::serenity();

    let handler = Handler {
        search_sessions: Arc::new(Mutex::new(SearchSessionStore::new())),
        tracks_preview,
        core: core.clone(),
        audio: audio.clone(),
        active_voice_channel: Arc::new(Mutex::new(None)),
        db,
        web_state: web_state.clone(),
        auto_leave_task: Arc::new(Mutex::new(None)),
        lavalink_password: arc_pass,
        local_tracks_dir: arc_local,
        docker_tracks_dir: arc_docker,
        default_volume,
        songbird: songbird.clone(),
        bot_index,
        hivemind,
        max_bots_per_channel,
    };

    let songbird_web_clone = songbird.clone();
    let audio_web_clone = audio.clone();
    let active_vc_clone = handler.active_voice_channel.clone();
    let web_state_clone = web_state.clone();
    let core_web_clone = core.clone();

    let mut client = Client::builder(token, intents)
        .event_handler(handler)
        .voice_manager_arc(songbird) 
        .await
        .expect("Err creating client");

    let cache_web_clone = client.cache.clone();

    tokio::spawn(async move {
        while let Some(cmd) = web_cmd_rx.recv().await {
            match cmd {
                crate::discord::WebDiscordCommand::Join(guild_id, channel_id) => {
                    if let Ok((conn_info, _)) = songbird_web_clone.join_gateway(guild_id, channel_id).await {
                        let mut active = active_vc_clone.lock().await; *active = Some(channel_id);
                        let audio_lock = audio_web_clone.lock().await;
                        audio_lock.backend.provide_voice_state(guild_id, channel_id.get(), conn_info.session_id, conn_info.token, conn_info.endpoint).await;
                        let current_vol = { core_web_clone.lock().await.playback.volume };
                        audio_lock.backend.set_volume(guild_id, current_vol).await;
                        let mut _state = web_state_clone.write().await;
                    }
                },
                crate::discord::WebDiscordCommand::Leave(guild_id) => {
                    let _ = songbird_web_clone.leave(guild_id).await;
                    { let mut active = active_vc_clone.lock().await; *active = None; }
                    { let audio_lock = audio_web_clone.lock().await; audio_lock.backend.delete_player(guild_id).await; }
                    let events = { let mut c = core_web_clone.lock().await; c.handle_command(Command::Clear) };
                    commands::process_core_events(guild_id, events, audio_web_clone.clone()).await;
                    let mut state = web_state_clone.write().await;
                    if let Some(bot) = state.iter_mut().find(|b| b.id == guild_id.get().to_string()) { bot.status = "idle".into(); bot.is_locked = false; }
                },
                crate::discord::WebDiscordCommand::CheckPerms(guild_id, user_id, reply_tx) => {
                    let mut is_allowed = false;
                    
                    if let Some(guild) = cache_web_clone.guild(guild_id) {

                        if let Some(user_voice) = guild.voice_states.get(&user_id) {
                            if let Some(user_channel_id) = user_voice.channel_id {
                                let bot_id = cache_web_clone.current_user().id;
                                
                                let bot_channel_id = guild.voice_states.get(&bot_id).and_then(|vs| vs.channel_id);
                                
                                match bot_channel_id {
                                    Some(bot_cid) => {
                                        if user_channel_id == bot_cid {
                                            is_allowed = true;
                                        }
                                    },
                                    None => {
                                        is_allowed = true;
                                    }
                                }
                            }
                        }
                    }
                    let _ = reply_tx.send(is_allowed);
                },
                crate::discord::WebDiscordCommand::GetUserChannel(guild_id, user_id, reply_tx) => {
                    let mut channel_res = None;
                    if let Some(guild) = cache_web_clone.guild(guild_id) {
                        if let Some(user_voice) = guild.voice_states.get(&user_id) {
                            if let Some(cid) = user_voice.channel_id {
                                channel_res = Some(cid.get().to_string());
                            }
                        }
                    }
                    let _ = reply_tx.send(channel_res);
                },
            }
        }
    });

    if let Err(why) = client.start().await { 
        println!("Client error: {:?}", why); 
    }
}