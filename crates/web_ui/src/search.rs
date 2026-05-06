use std::fs;
use std::path::Path;
use anyhow::Context;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TracksPreview {
    pub tracks: Vec<TrackPreview>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TrackPreview {
    pub id: String,
    pub title: String,
    pub normalized: NormalizedPreview,
}

#[derive(Debug, Deserialize, Clone)]
pub struct NormalizedPreview {
    pub tokens: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum SearchResult {
    NoMatch,
    Single {
        track_id: String,
    },
    Multiple {
        results: Vec<ScoredTrack>,
    },
}

#[derive(Debug, Clone)]
pub struct ScoredTrack {
    pub index: usize,
    pub track_id: String,
    pub title: String,
    pub score: usize,
}

pub fn load_tracks_preview(path: &Path) -> anyhow::Result<TracksPreview> {
    let yaml = fs::read_to_string(path)
        .with_context(|| {
            format!(
                "Failed to read tracks_normalized_preview.yaml from {}",
                path.display()
            )
        })?;

    let preview: TracksPreview = serde_yaml::from_str(&yaml)
        .context("Failed to parse tracks_normalized_preview.yaml")?;

    Ok(preview)
}

pub fn search(
    preview: &TracksPreview,
    query: &str,
) -> SearchResult {
    let query_tokens: Vec<String> = query
        .to_lowercase()
        .split_whitespace()
        .map(|s| s.to_string())
        .collect();

    if query_tokens.is_empty() {
        return SearchResult::NoMatch;
    }

    let mut matches: Vec<(usize, &TrackPreview)> = Vec::new();

    for track in &preview.tracks {
        let mut score = 0;

        for qt in &query_tokens {
            if track.normalized.tokens.iter().any(|t| t == qt) {
                score += 1;
            }
        }

        if score == query_tokens.len() {
            matches.push((score, track));
        }
    }

    if matches.is_empty() {
        return SearchResult::NoMatch;
    }

    if matches.len() == 1 {
        return SearchResult::Single {
            track_id: matches[0].1.id.clone(),
        };
    }

    matches.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| a.1.title.cmp(&b.1.title))
    });

    let results = matches
        .into_iter()
        .enumerate()
        .map(|(i, (score, track))| ScoredTrack {
            index: i + 1,
            track_id: track.id.clone(),
            title: track.title.clone(),
            score,
        })
        .collect();

    SearchResult::Multiple { results }
}