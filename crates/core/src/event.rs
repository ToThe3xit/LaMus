use crate::track::TrackId;
use crate::playback::PlaybackMode;

// ============================================================ //
// ==== EVENT AND NOTIFICATION STRUCTURES ===================== //
// ============================================================ //
#[derive(Debug, Clone, PartialEq)]
pub enum RadioSource {
    Network,
    Local,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event{
    TrackAdded{
        track_id:TrackId,
    },

    TrackRemoved{
        track_id:TrackId,
    },

    PlaybackModeChanged{
        mode: PlaybackMode,
    },
    VolumeChanged{
        volume:u8,
    },
    PlaybackStarted{
        track_id: TrackId,
        instance_id: u64,
    },
    PlaybackPaused{
        track_id: TrackId
    },
    PlaybackResumed,
    PlaybackStopped,

    PlaybackPositionReset,

    PlaybackSeeked {
        seconds: u64,
    },

    NetworkRadioToggled(bool),
    LocalRadioToggled(bool),
    RadioTriggered {
        source: RadioSource,
    },

    LoopToggled(bool),
    
    QueueShuffled,
}