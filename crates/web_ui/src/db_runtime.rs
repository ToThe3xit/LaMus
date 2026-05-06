use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Context;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct DbFile {
    root: String,
    tracks: Vec<DbTrack>,
}

#[derive(Debug, Deserialize)]
struct DbTrack {
    id: String,
    file: String,
    duration: u64,
}

pub struct DbRuntime {
    tracks: HashMap<String, (PathBuf, u64)>,
}

impl DbRuntime {
    pub fn load(path: &Path) -> anyhow::Result<Self> {
        let yaml = fs::read_to_string(path)
            .with_context(|| format!("Failed to read db.yaml from {}", path.display()))?;

        let parsed: DbFile =
            serde_yaml::from_str(&yaml).context("Failed to parse db.yaml")?;

        let root = PathBuf::from(parsed.root);
        let mut map = HashMap::new();

        for track in parsed.tracks {
            let full_path = root.join(track.file);
            map.insert(track.id, (full_path, track.duration));
        }

        Ok(Self { tracks: map })
    }

    pub fn get(&self, id: &str) -> Option<&(PathBuf, u64)> {
        self.tracks.get(id)
    }
}