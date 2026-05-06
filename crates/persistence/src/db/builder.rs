use crate::db::{model::{Database, Track}, scanner, duration};

use sha1::{Sha1, Digest};
use std::path::Path;
use chrono::Utc;

// ============================================================ //
// ==== MAIN DATABASE FILE GENERATOR (DB.YAML) ================ //
// ============================================================ //
pub fn rebuild_database(tracks_root: &Path, output: &Path) -> anyhow::Result<()>{
    let files = scanner::scan_audio_files(tracks_root);

    let mut tracks = Vec::new();

    for file in files{
        let duration = match duration::get_duration_seconds(&file){
            Some(d) => d,
            None => continue,
        };

        let title = file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let hash_input = format!("{}:{}",title.to_lowercase(), duration);
        let mut hasher = Sha1::new();
        hasher.update(hash_input);
        let id = format!("{:x}",hasher.finalize())[..12].to_string();

        let relative = file
            .strip_prefix(tracks_root)
            .unwrap()
            .to_string_lossy()
            .to_string();

        tracks.push(Track{
            id,
            title,
            duration,
            file: relative,
        });
    }

    let db = Database{
        version: 1,
        generated_at: Utc::now().to_rfc3339(),
        root: tracks_root.to_string_lossy().to_string(),
        tracks,
    };

    let yaml = serde_yaml::to_string(&db)?;
    std::fs::write(output, yaml)?;

    Ok(())
}