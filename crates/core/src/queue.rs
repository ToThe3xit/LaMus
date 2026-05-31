use crate::track::{Track, TrackId};
use rand::seq::SliceRandom;
use rand::thread_rng;

// ============================================================ //
// ==== PLAYBACK QUEUE ABSTRACTION ============================ //
// ============================================================ //

#[derive(Debug, Clone)]
pub enum SortMode {
    Title,
    Duration,
    //Source,
}

#[derive(Debug)]
pub struct Queue{
    tracks: Vec<Track>,
    current_index: Option<usize>,
}

impl Queue{
    pub fn new() -> Self{
        Self{
            tracks: Vec::new(),
            current_index: None,
        }
    }
    pub fn add_track(&mut self, track: Track){
        self.tracks.push(track);

        if self.current_index.is_none(){
            self.current_index = Some(0);
        }
    }
    pub fn remove_track(&mut self, track_id: &TrackId) -> bool{
        if let Some(pos) = self.tracks.iter().position(|t| &t.id == track_id){
            self.tracks.remove(pos);

            if let Some(idx) = self.current_index{
                if pos <= idx && idx > 0{
                    self.current_index = Some(idx - 1);
                }else if self.tracks.is_empty(){
                    self.current_index = None;
                }
            }
            true
        }else{
            false
        }
    }
    pub fn current_track(&self) -> Option<&Track>{
        self.current_index.and_then(|i| self.tracks.get(i))
    }
    pub fn tracks(&self) -> &[Track]{
        &self.tracks
    }
    pub fn len(&self) -> usize{
        self.tracks.len()
    }
    pub fn is_empty(&self) -> bool{
        self.tracks.is_empty()
    }
    pub fn clear(&mut self){
        self.tracks.clear();
    }
    pub fn move_track(&mut self, from: usize, to: usize) -> bool {
        let len = self.tracks.len();
        if from < len && to < len {
            let track = self.tracks.remove(from);
            self.tracks.insert(to, track);
            true
        } else {
            false
        }
    }
    pub fn insert_at_front(&mut self, track: Track) {
        self.tracks.insert(0, track);

        if self.current_index.is_none() {
            self.current_index = Some(0);
        }
    }
    pub fn shuffle_upcoming(&mut self) {
        if self.tracks.len() <= 2 {
            return;
        }

        let mut rng = thread_rng();

        if let Some(current_index) = self.current_index {
            if current_index + 1 < self.tracks.len() {
                self.tracks[(current_index + 1)..].shuffle(&mut rng);
            }
        }
    }
    pub fn dedup_upcoming(&mut self) {
        if self.tracks.len() <= 1 {
            return;
        }

        let mut seen = std::collections::HashSet::new();

        if let Some(current) = self.tracks.first() {
            seen.insert(current.id.clone());
        }

        let mut i = 1;
        while i < self.tracks.len() {
            if seen.contains(&self.tracks[i].id) {
                self.tracks.remove(i);
            } else {
                seen.insert(self.tracks[i].id.clone());
                i += 1;
            }
        }
    }
    pub fn sort_upcoming(&mut self, mode: SortMode) {
        if self.tracks.len() <= 2 {
            return;
        }

        if let Some(current_index) = self.current_index {
            let start = current_index + 1;
            if start >= self.tracks.len() {
                return;
            }

            self.tracks[start..].sort_by(|a, b| match mode {
                SortMode::Title => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
                SortMode::Duration => a.duration_seconds.cmp(&b.duration_seconds),
                /*SortMode::Source => {
                    let ord = |s: &crate::track::AudioSource| match s {
                        crate::track::AudioSource::Local => 0,
                        crate::track::AudioSource::Lavalink => 1,
                    };
                    ord(&a.source).cmp(&ord(&b.source))
                }*/
            });
        }
    }
}