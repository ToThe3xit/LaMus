use crate::track::TrackId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackMode{
    Playing,
    Paused,
    Stopped,
}

#[derive(Debug, Clone)]
pub struct PlaybackState{
    pub current_track: Option<TrackId>,
    pub position_seconds: u64,
    pub volume: u8,
    pub mode: PlaybackMode,
    pub playback_instance_id: u64,
    pub is_looping: bool,
}

impl PlaybackState{
    pub fn stopped() -> Self{
        Self{
            current_track: None,
            position_seconds: 0,
            volume: 20,
            mode: PlaybackMode::Stopped,
            playback_instance_id: 0,
            is_looping: false,
        }
    }
}