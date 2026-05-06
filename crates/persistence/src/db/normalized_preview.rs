use std::fs::File;
use std::io::Write;
use std::path::Path;
use serde::Serialize;

use crate::db::model::Database;
use musicbot_core::normalize::{normalize, NormalizationConfig};

// ============================================================ //
// ==== OPTIMIZED SEARCH CACHE GENERATOR ====================== //
// ============================================================ //
#[derive(Serialize)]
struct NormalizedPreview {
    tokens: Vec<String>,
}

#[derive(Serialize)]
struct TrackPreview {
    id: String,
    title: String,
    normalized: NormalizedPreview,
}

#[derive(Serialize)]
struct PreviewFile {
    tracks: Vec<TrackPreview>,
}

pub fn generate_tracks_normalized_preview(
    db: &Database,
    normalization_config: &NormalizationConfig,
    output_path: &Path,
) -> anyhow::Result<()> {
    let mut tracks = Vec::new();

    for track in &db.tracks {
        let normalized = normalize(&track.title, normalization_config);

        tracks.push(TrackPreview {
            id: track.id.clone(),
            title: track.title.clone(),
            normalized: NormalizedPreview {
                tokens: normalized.tokens,
            },
        });
    }

    let preview = PreviewFile { tracks };
    let yaml = serde_yaml::to_string(&preview)?;

    let mut file = File::create(output_path)?;
    file.write_all(yaml.as_bytes())?;

    println!("[PERSISTENCE] Generated optimized token preview (tracks_normalized_preview.yaml)");

    Ok(())
}