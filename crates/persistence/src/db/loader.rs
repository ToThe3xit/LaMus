use std::path::Path;

use crate::db::{
    builder::rebuild_database,
    model::Database,
    normalized_preview::generate_tracks_normalized_preview,
};
use crate::db::normalization::load_normalization_config;

// ============================================================ //
// ==== MAIN DATABASE LOADING MODULE (LOADER) ================= //
// ============================================================ //
pub fn load_or_rebuild(
    tracks_root: &Path,
    db_path: &Path,
    force_rebuild: bool,
    norm_path: &Path,
    preview_path: &Path,
) -> anyhow::Result<Database>{

    let rebuilt = true;

    if force_rebuild || !db_path.exists(){
        println!("[PERSISTENCE] Database does not exist or rebuild was forced. Started scanning resources...");
        rebuild_database(tracks_root,db_path)?;
    }else{
        println!("[PERSISTENCE] Database file found. Loading...");
    }
    let yaml = std::fs::read_to_string(db_path)?;
    let db: Database = serde_yaml::from_str(&yaml)?;

    println!("[PERSISTENCE] Loaded local database (Root: {}, Tracks: {})", db.root, db.tracks.len());

    if rebuilt {
        let normalization_config = load_normalization_config(norm_path.to_str().unwrap());
        generate_tracks_normalized_preview(
            &db,
            &normalization_config,
            preview_path,
        )?;
    }

    Ok(db)
}