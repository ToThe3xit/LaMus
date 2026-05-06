use std::path::{Path, PathBuf};
use walkdir::WalkDir;

// ============================================================ //
// ==== RECURSIVE FILE SYSTEM SCANNING MODULE ================= //
// ============================================================ //
pub fn scan_audio_files(root: &Path) -> Vec<PathBuf>{
    WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            matches!(
                e.path().extension().and_then(|s| s.to_str()),
                Some("mp3") | Some("wav") | Some("flac")
            )
        })
        .map(|e| e.path().to_path_buf())
        .collect()
}