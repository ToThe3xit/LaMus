use std::fs;
use serde::Deserialize;

use musicbot_core::normalize::NormalizationConfig;

// ============================================================ //
// ==== LOADING PRE-NORMALIZATION RULES ======================= //
// ============================================================ //
#[derive(Debug, Deserialize)]
struct RawNormalizationConfig {
    bracket_pairs: Vec<(char, char)>,
    noise_keywords: Vec<String>,
    trash_tokens: Vec<String>,

    split_chars: Vec<char>,
    trim_chars: Vec<char>,
}

pub fn load_normalization_config(path: &str) -> NormalizationConfig {
    let content = fs::read_to_string(path)
        .expect("Failed to read normalization config file");

    let raw: RawNormalizationConfig = serde_yaml::from_str(&content)
        .expect("Invalid normalization config format");

    NormalizationConfig {
        bracket_pairs: raw.bracket_pairs,
        noise_keywords: raw.noise_keywords,
        trash_tokens: raw.trash_tokens,
        split_chars: raw.split_chars,
        trim_chars: raw.trim_chars,
    }
}