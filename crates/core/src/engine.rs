use crate::{
    command::Command,
    event::{Event, RadioSource},
    playback::{PlaybackMode, PlaybackState},
    queue::Queue,
    track::{Track,TrackId},
};

// ============================================================ //
// ==== CORE STATE STRUCTURE (STATE MACHINE) ================== //
// ============================================================ //
#[derive(Debug)]
pub struct CoreState{
    pub queue: Queue,
    pub playback: PlaybackState,
    
    pub network_radio_enabled: bool,
    pub local_radio_enabled: bool,
    pub last_radio_was_network: bool,
    pub radio_tracks: Vec<TrackId>,
    pub history: Vec<Track>,
}

impl CoreState{
    pub fn new() -> Self{
        Self{
            queue: Queue::new(),
            playback: PlaybackState::stopped(),
            network_radio_enabled: false,
            local_radio_enabled: false,
            last_radio_was_network: false,
            radio_tracks: Vec::new(),
            history: Vec::new(),
        }
    }

    // ============================================================ //
    // ==== COMMAND PROCESSOR (DISPATCHER) ======================== //
    // ============================================================ //    
    pub fn handle_command(&mut self, command:Command) -> Vec<Event>{
        match command{
            Command::Play => self.handle_play(),
            Command::Pause => self.handle_pause(),
            Command::Stop => self.handle_stop(),
            Command::AddTrack {track} => self.handle_add_track(track),
            Command::RemoveTrack {track_id} => self.handle_remove_track(track_id),
            Command::SetVolume {volume} => self.handle_set_volume(volume),
            Command::Skip => self.handle_skip(),
            Command::Clear => self.handle_clear(),
            Command::UpdatePosition { seconds } => self.handle_update_position(seconds),
            Command::Seek { seconds } => self.handle_seek(seconds),
            Command::ToggleNetworkRadio => self.handle_toggle_network_radio(),
            Command::ToggleLocalRadio => self.handle_toggle_local_radio(),
            Command::MoveTrack { from, to } => self.handle_move_track(from, to),
            Command::Previous => self.handle_previous(),
            Command::RemoveAtIndex { index } => self.handle_remove_at_index(index),
            Command::PlayIndex { index } => self.handle_play_index(index),
            Command::ToggleLoop => self.handle_toggle_loop(),
        }
    }

    // ============================================================ //
    // ==== PLAYBACK CONTROL LOGIC ================================ //
    // ============================================================ //    
    fn handle_play(&mut self) -> Vec<Event>{
        use PlaybackMode::*;

        match self.playback.mode{
            Playing => {vec![]}
            Paused => {
                self.playback.mode = Playing;
                vec![Event::PlaybackResumed]
            }
            Stopped => {
                if let Some(track) = self.queue.current_track() {
                    self.playback.current_track = Some(track.id.clone());
                    self.playback.position_seconds = 0;
                    self.playback.mode = Playing;
                    self.playback.playback_instance_id += 1;
                    let instance_id = self.playback.playback_instance_id;
                    vec![Event::PlaybackStarted {
                        track_id: track.id.clone(), 
                        instance_id,
                    }]
                }else{vec![]}
            }
        }
    }
    
    fn handle_pause(&mut self) -> Vec<Event>{
        use PlaybackMode::*;

        match self.playback.mode{
            Playing => {
                self.playback.mode = Paused;
                if let Some(track_id) = self.playback.current_track.clone(){
                    vec![Event::PlaybackPaused{track_id}]
                }else{
                    vec![]
                }
            }
            Paused | Stopped => {vec![]}
        }
    }
    
    fn handle_stop(&mut self) -> Vec<Event>{
        use PlaybackMode::*;

        match self.playback.mode{
            Playing | Paused => {
                self.playback.mode = Stopped;
                self.playback.current_track = None;
                self.playback.position_seconds = 0;

                vec![
                    Event::PlaybackStopped,
                    Event::PlaybackPositionReset,
                ]
            }
            Stopped => {vec![]}
        }
    }
    
    fn handle_add_track(&mut self, track: Track) -> Vec<Event>{
        let track_id = track.id.clone();
        self.queue.add_track(track);
        vec![Event::TrackAdded{track_id}]
    }
    
    fn handle_remove_track(&mut self, track_id: TrackId) -> Vec<Event>{
        let removed = self.queue.remove_track(&track_id);
        if removed{
            vec![
                Event::TrackRemoved{
                    track_id,
                }
            ]
        }else{vec![]}
    }
    
    fn handle_set_volume(&mut self, volume: u8) -> Vec<Event>{
        let clamped = volume.min(100);
        if self.playback.volume != clamped{
            self.playback.volume = clamped;
            vec![
                Event::VolumeChanged{
                    volume:clamped,
                }
            ]
        }else{vec![]}
    }

    // ============================================================ //
    // ==== SKIP AND RADIO LOGIC (SMART AUTOPLAY) ================= //
    // ============================================================ //    
   fn handle_skip(&mut self) -> Vec<Event>{
        use PlaybackMode::*;

        match self.playback.mode{
            Playing | Paused => {
                let next_track = {
                    let current = self.queue.current_track().cloned();

                    if let Some(track) = current {
                        if self.playback.is_looping {
                            Some(track.id.clone())
                        } else {
                            self.history.push(track.clone());
                            
                            let mut tracks = self.queue.tracks().to_vec();
                            if !tracks.is_empty() {
                                tracks.remove(0); 
                            }
                            self.queue.clear();
                            for t in tracks {
                                self.queue.add_track(t);
                            }
                            
                            self.queue.current_track().map(|t| t.id.clone())
                        }
                    } else { None }
                };
                
                self.playback.position_seconds = 0;

                if let Some(next_id) = next_track {
                    self.playback.current_track = Some(next_id.clone());
                    self.playback.mode = Playing;
                    self.playback.playback_instance_id += 1;
                    let instance_id = self.playback.playback_instance_id;
                    vec![
                        Event::PlaybackPositionReset,
                        Event::PlaybackStarted {
                            track_id: next_id,
                            instance_id,
                        }
                    ]
                } else {
                    self.playback.current_track = None;
                    self.playback.mode = Stopped;

                    let mut events = vec![
                        Event::PlaybackStopped,
                        Event::PlaybackPositionReset,
                        Event::PlaybackModeChanged{
                            mode: Stopped,
                        },
                    ];

                    if self.network_radio_enabled || self.local_radio_enabled {
                        let source = if self.network_radio_enabled && self.local_radio_enabled {
                            if self.last_radio_was_network {
                                self.last_radio_was_network = false;
                                RadioSource::Local
                            } else {
                                self.last_radio_was_network = true;
                                RadioSource::Network
                            }
                        } else if self.network_radio_enabled {
                            RadioSource::Network
                        } else {
                            RadioSource::Local
                        };

                        events.push(Event::RadioTriggered { source });
                    }

                    events
                }
            }
            Stopped => {vec![]}
        }
    }

    fn handle_previous(&mut self) -> Vec<Event> {
        use PlaybackMode::*;
        
        if self.history.is_empty() {
            if self.playback.mode == Playing || self.playback.mode == Paused {
                self.playback.position_seconds = 0;
                return vec![Event::PlaybackSeeked { seconds: 0 }];
            }
            return vec![];
        }

        let prev_track = self.history.pop().unwrap();
        let prev_id = prev_track.id.clone();
        self.queue.insert_at_front(prev_track);

        self.playback.position_seconds = 0;
        self.playback.current_track = Some(prev_id.clone());
        self.playback.mode = Playing;
        self.playback.playback_instance_id += 1;

        vec![
            Event::PlaybackPositionReset,
            Event::PlaybackStarted {
                track_id: prev_id,
                instance_id: self.playback.playback_instance_id,
            }
        ]
    }
    
    fn handle_clear(&mut self) -> Vec<Event> {
        use PlaybackMode::*;

        self.queue.clear();
        self.history.clear();
        self.network_radio_enabled = false;
        self.local_radio_enabled = false;

        self.playback.mode = Stopped;
        self.playback.current_track = None;
        self.playback.position_seconds = 0;
        self.playback.playback_instance_id = 0;

        vec![
            Event::PlaybackStopped,
            Event::PlaybackPositionReset,
            Event::PlaybackModeChanged { mode: Stopped },
        ]
    }
    
    fn handle_update_position(&mut self, seconds: u64) -> Vec<Event> {
        use PlaybackMode::*;

        match self.playback.mode {
            Playing | Paused => {
                if seconds >= self.playback.position_seconds {
                    self.playback.position_seconds = seconds;
                }
                vec![]
            }
            Stopped => vec![],
        }
    }
    
    fn handle_seek(&mut self, seconds: u64) -> Vec<Event> {
        use PlaybackMode::*;

        match self.playback.mode {
            Playing | Paused => {
                self.playback.position_seconds = seconds;
                vec![
                    Event::PlaybackSeeked { seconds }
                ]
            }
            Stopped => vec![],
        }
    }
    
    fn handle_toggle_network_radio(&mut self) -> Vec<Event> {
        self.network_radio_enabled = !self.network_radio_enabled;
        vec![Event::NetworkRadioToggled(self.network_radio_enabled)]
    }

    fn handle_toggle_local_radio(&mut self) -> Vec<Event> {
        self.local_radio_enabled = !self.local_radio_enabled;
        vec![Event::LocalRadioToggled(self.local_radio_enabled)]
    }
    
    // ============================================================ //
    // ==== QUEUE AND HISTORY MANAGEMENT ========================== //
    // ============================================================ //
    fn handle_move_track(&mut self, from: usize, to: usize) -> Vec<Event> {
        let mut unified: Vec<Track> = self.history.clone();
        unified.extend(self.queue.tracks().iter().cloned());

        if from >= unified.len() || to >= unified.len() { return vec![]; }

        let playing_idx = self.history.len();

        let moved_track = unified.remove(from);

        unified.insert(to, moved_track);

        let new_playing_idx = if playing_idx == from {
            to
        } else if from < playing_idx && to >= playing_idx {
            playing_idx - 1
        } else if from > playing_idx && to <= playing_idx {
            playing_idx + 1
        } else {
            playing_idx
        };

        self.history = unified.drain(0..new_playing_idx).collect();
        self.queue.clear();
        for track in unified {
            self.queue.add_track(track);
        }

        vec![] 
    }

    fn handle_remove_at_index(&mut self, index: usize) -> Vec<Event> {
        let history_len = self.history.len();

        if index < history_len {
            self.history.remove(index);
        } else {
            let queue_idx = index - history_len;
            let mut tracks = self.queue.tracks().to_vec();

            if queue_idx < tracks.len() {
                let removed_track = tracks.remove(queue_idx);
                let track_id = removed_track.id.clone();
                
                self.queue.clear();
                for t in tracks {
                    self.queue.add_track(t);
                }
                
                return vec![Event::TrackRemoved { track_id }];
            }
        }

        vec![]
    }
    pub fn handle_play_index(&mut self, index: usize) -> Vec<Event> {
        use crate::playback::PlaybackMode;

        let mut unified: Vec<Track> = self.history.clone();
        unified.extend(self.queue.tracks().iter().cloned());

        if index >= unified.len() {
            return vec![];
        }

        let target_id = unified[index].id.clone();

        self.history = unified[0..index].to_vec();
        
        self.queue.clear();
        for track in unified.into_iter().skip(index) {
            self.queue.add_track(track); 
        }

        self.playback.position_seconds = 0;
        self.playback.current_track = Some(target_id.clone());
        self.playback.mode = PlaybackMode::Playing;
        
        self.playback.playback_instance_id += 1;
        let instance_id = self.playback.playback_instance_id;

        vec![
            Event::PlaybackPositionReset,
            Event::PlaybackStarted {
                track_id: target_id,
                instance_id,
            }
        ]
    }
    fn handle_toggle_loop(&mut self) -> Vec<Event> {
        self.playback.is_looping = !self.playback.is_looping;
        vec![Event::LoopToggled(self.playback.is_looping)]
    }
}