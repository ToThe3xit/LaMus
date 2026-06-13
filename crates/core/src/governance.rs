use std::collections::{HashMap, HashSet};
use tokio::sync::RwLock;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct VoteSession {
    pub action: VoteAction,
    pub action_payload: Option<String>,
    pub initiated_by: u64,
    pub votes: HashSet<u64>,
    pub eligible_voters: HashSet<u64>,
    pub required_votes: usize,
    pub started_at: Instant,
    pub timeout: Duration,
    pub bot_index: usize,
    pub server_id: String,
}

impl VoteSession {
    pub fn is_expired(&self) -> bool {
        self.started_at.elapsed() >= self.timeout
    }

    pub fn has_passed(&self) -> bool {
        self.votes.len() >= self.required_votes
    }

    pub fn status(&self) -> (usize, usize, u64) {
        let elapsed = self.started_at.elapsed();
        let remaining = self.timeout.saturating_sub(elapsed);
        (self.votes.len(), self.required_votes, remaining.as_secs())
    }
}
#[derive(Debug)]
pub enum VoteCastResult {
    Recorded,
    Passed(VoteAction, Option<String>),
    NoVoteActive,
    NotEligible,
    AlreadyVoted,
    Expired,
}
#[derive(Debug, Clone)]
pub struct VoteStateInfo {
    pub action: String,
    pub current_votes: usize,
    pub required_votes: usize,
    pub seconds_remaining: u64,
    pub initiated_by: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum VoteAction {
    Skip,
    ClearQueue,
    LeaveChannel,
    TogglePause,
}

impl VoteAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            VoteAction::Skip => "skip",
            VoteAction::ClearQueue => "clear",
            VoteAction::LeaveChannel => "leave",
            VoteAction::TogglePause => "play_pause",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "skip" => Some(VoteAction::Skip),
            "clear" => Some(VoteAction::ClearQueue),
            "leave" => Some(VoteAction::LeaveChannel),
            "play_pause" => Some(VoteAction::TogglePause),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SessionSnapshot {
    pub queue_tracks_json: Vec<String>,
    pub current_track_index: usize,
    pub position_seconds: u64,
    pub radio_network: bool,
    pub radio_local: bool,
    pub taken_at: Instant,
}

#[derive(Debug, Clone)]
pub struct BotSessionOwnership {
    pub owner_id: Option<u64>,
    pub owner_name: Option<String>,
    pub delegated_users: HashSet<u64>,
}

impl Default for BotSessionOwnership {
    fn default() -> Self {
        Self {
            owner_id: None,
            owner_name: None,
            delegated_users: HashSet::new(),
        }
    }
}

#[derive(Debug, Default)]
pub struct GovernanceState {
    pub ownership: HashMap<usize, BotSessionOwnership>,
    pub active_vote: HashMap<usize, VoteSession>,
    pub snapshots: HashMap<usize, SessionSnapshot>,
}

pub struct SessionGovernance {
    pub state: RwLock<GovernanceState>,
    pub required_percentage: u8,
    pub vote_timeout: Duration,
    pub rollback_window: Duration,
}

impl SessionGovernance {
    pub fn new(required_percentage: u8, vote_timeout_secs: u64) -> Self {
        Self {
            state: RwLock::new(GovernanceState::default()),
            required_percentage,
            vote_timeout: Duration::from_secs(vote_timeout_secs),
            rollback_window: Duration::from_secs(60),
        }
    }

    pub async fn set_owner(
        &self,
        bot_index: usize,
        user_id: u64,
        user_name: String,
    ) {
        let mut s = self.state.write().await;
        let entry = s.ownership.entry(bot_index).or_default();
        if entry.owner_id.is_none() {
            entry.owner_id = Some(user_id);
            entry.owner_name = Some(user_name);
            println!("[GOVERNANCE] Bot #{} session owner set: {} ({})", bot_index, user_id, entry.owner_name.as_deref().unwrap_or("?"));
        }
    }

    pub async fn clear_session(&self, bot_index: usize) {
        let mut s = self.state.write().await;
        s.ownership.remove(&bot_index);
        s.active_vote.remove(&bot_index);
    }

    pub async fn get_owner_id(&self, bot_index: usize) -> Option<u64> {
        self.state.read().await.ownership.get(&bot_index).and_then(|o| o.owner_id)
    }

    pub async fn transfer_owner(
        &self,
        bot_index: usize,
        channel_members: &[u64],
    ) {
        let mut s = self.state.write().await;
        let entry = s.ownership.entry(bot_index).or_default();

        let new_owner = entry.delegated_users.iter()
            .find(|id| channel_members.contains(id))
            .copied()
            .or_else(|| {
                channel_members.first().copied()
            });

        entry.owner_id = new_owner;
        entry.owner_name = None;
        entry.delegated_users.retain(|id| channel_members.contains(id));

        println!("[GOVERNANCE] Bot #{} ownership transferred → {:?}", bot_index, new_owner);
    }

    pub async fn delegate(
        &self,
        bot_index: usize,
        caller: u64,
        target: u64,
        is_moderator: bool,
    ) -> bool {
        let s = self.state.read().await;
        let is_owner = s.ownership.get(&bot_index).and_then(|o| o.owner_id) == Some(caller);
        drop(s);

        if !is_owner && !is_moderator {
            return false;
        }

        let mut s = self.state.write().await;
        s.ownership.entry(bot_index).or_default().delegated_users.insert(target);
        true
    }

    pub async fn revoke_delegate(&self, bot_index: usize, target: u64) {
        let mut s = self.state.write().await;
        if let Some(entry) = s.ownership.get_mut(&bot_index) {
            entry.delegated_users.remove(&target);
        }
    }

    pub async fn has_direct_permission(
        &self,
        bot_index: usize,
        user_id: u64,
        is_moderator: bool,
    ) -> bool {
        if is_moderator {
            return true;
        }
        let s = self.state.read().await;
        if let Some(ownership) = s.ownership.get(&bot_index) {
            if ownership.owner_id == Some(user_id) {
                return true;
            }
            if ownership.delegated_users.contains(&user_id) {
                return true;
            }
        }
        false
    }

    // ─── VOTE MANAGEMENT ──────────────────────────────────────────

    pub async fn start_vote(
        &self,
        bot_index: usize,
        server_id: String,
        action: VoteAction,
        action_payload: Option<String>,
        initiated_by: u64,
        channel_members: Vec<u64>,
        required_percentage: u8,
    ) -> Result<(), &'static str> {
        let mut s = self.state.write().await;
        if s.active_vote.contains_key(&bot_index) {
            return Err("vote_already_active");
        }

        let mut eligible: std::collections::HashSet<u64> = channel_members.iter().copied().collect();
        eligible.insert(initiated_by);

        let n = eligible.len();
        if n == 0 {
            return Err("no_eligible_voters");
        }
        let required = ((n as f64 * required_percentage as f64 / 100.0).ceil() as usize).max(1);

        s.active_vote.insert(bot_index, VoteSession {
            action,
            action_payload,
            initiated_by,
            votes: std::collections::HashSet::new(),
            eligible_voters: eligible,
            required_votes: required,
            started_at: std::time::Instant::now(),
            timeout: self.vote_timeout,
            bot_index,
            server_id,
        });
        println!("[GOVERNANCE] Vote started on bot #{}: {}/{} votes needed", bot_index, required, n);
        Ok(())
    }

    pub async fn cast_vote(&self, bot_index: usize, voter_id: u64) -> VoteCastResult {
        let mut s = self.state.write().await;
        let vote = match s.active_vote.get_mut(&bot_index) {
            Some(v) => v,
            None => return VoteCastResult::NoVoteActive,
        };
        if vote.is_expired() {
            s.active_vote.remove(&bot_index);
            return VoteCastResult::Expired;
        }
        if !vote.eligible_voters.contains(&voter_id) {
            return VoteCastResult::NotEligible;
        }
        if vote.votes.contains(&voter_id) {
            return VoteCastResult::AlreadyVoted;
        }
        vote.votes.insert(voter_id);
        if vote.has_passed() {
            let vote_clone = s.active_vote.remove(&bot_index).unwrap();
            return VoteCastResult::Passed(vote_clone.action, vote_clone.action_payload);
        }
        VoteCastResult::Recorded
    }

    pub async fn cancel_vote(&self, bot_index: usize) -> bool {
        self.state.write().await.active_vote.remove(&bot_index).is_some()
    }

    pub async fn cleanup_expired_votes(&self) {
        let mut s = self.state.write().await;
        s.active_vote.retain(|_, v| !v.is_expired());
    }

    pub async fn get_vote_status(&self, bot_index: usize) -> Option<(VoteAction, usize, usize, u64)> {
        let s = self.state.read().await;
        s.active_vote.get(&bot_index).map(|v| {
            let (cur, req, rem) = v.status();
            (v.action.clone(), cur, req, rem)
        })
    }

    // ─── SNAPSHOT / ROLLBACK ─────────────────────────────────────

    pub async fn save_snapshot(&self, bot_index: usize, snapshot: SessionSnapshot) {
        let mut s = self.state.write().await;
        s.snapshots.insert(bot_index, snapshot);
    }

    pub async fn take_snapshot(&self, bot_index: usize) -> Option<SessionSnapshot> {
        let mut s = self.state.write().await;
        let snap = s.snapshots.remove(&bot_index)?;
        if snap.taken_at.elapsed() > self.rollback_window {
            println!("[GOVERNANCE] Snapshot for bot #{} expired", bot_index);
            return None;
        }
        Some(snap)
    }

    pub async fn has_valid_snapshot(&self, bot_index: usize) -> bool {
        let s = self.state.read().await;
        s.snapshots.get(&bot_index)
            .map(|snap| snap.taken_at.elapsed() <= self.rollback_window)
            .unwrap_or(false)
    }
}