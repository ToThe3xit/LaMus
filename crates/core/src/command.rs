use crate::track::{Track, TrackId};

// ============================================================ //
// ==== INTERNAL COMMAND STRUCTURE ============================ //
// ============================================================ //
#[derive(Debug)]
pub enum Command{
    Play,
    Pause,
    Stop,
    Skip,
    Clear,
    
    AddTrack{
        track:Track,
    },

    RemoveTrack{
        track_id:TrackId,
    },

    SetVolume{
        volume:u8,
    },

    UpdatePosition{
        seconds: u64,
    },

    Seek{
        seconds: u64,
    },

    ToggleNetworkRadio,
    ToggleLocalRadio,

    MoveTrack { from: usize, to: usize },
    
    Previous,

    RemoveAtIndex { index: usize },
    
    PlayIndex { index: usize },

    ToggleLoop,

    ShuffleQueue,

    DeduplicateQueue,

    SortQueue { mode: crate::queue::SortMode, },
}