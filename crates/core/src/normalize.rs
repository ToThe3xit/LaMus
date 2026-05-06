use std::collections::HashSet;

// ============================================================ //
// ==== NORMALIZATION CONFIGURATION STRUCTURES ================ //
// ============================================================ //
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedTitle {
    pub tokens: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct NormalizationConfig {
    pub bracket_pairs: Vec<(char, char)>,
    pub noise_keywords: Vec<String>,
    pub trash_tokens: Vec<String>,
    pub split_chars: Vec<char>,
    pub trim_chars: Vec<char>,
}

// ============================================================ //
// ==== MAIN TEXT NORMALIZATION ALGORITHM ===================== //
// ============================================================ //
pub fn normalize(input: &str, config: &NormalizationConfig) -> NormalizedTitle {
    let cleaned = remove_bracket_and_pipe_noise(input, config);
    let lower = cleaned.to_lowercase();
    let tokens = tokenize(&lower, config);
    NormalizedTitle { tokens }
}

// ============================================================ //
// ==== HELPER FUNCTIONS AND FILTERS (TOKENIZATION) =========== //
// ============================================================ //
fn remove_bracket_and_pipe_noise(input: &str, config: &NormalizationConfig) -> String {
    let mut result = String::new();
    let mut buf = String::new();

    let mut active_closer: Option<char> = None;
    let mut pipe_mode = false;

    for c in input.chars() {
        if active_closer.is_none() && !pipe_mode && (c == '|' || c == '｜') {
            buf.clear();
            pipe_mode = true;
            continue;
        }

        match active_closer {
            None => {
                if let Some((_, close)) = config
                    .bracket_pairs
                    .iter()
                    .find(|(open, _)| *open == c)
                {
                    buf.clear();
                    active_closer = Some(*close);
                } else if pipe_mode {
                    buf.push(c);
                } else {
                    result.push(c);
                }
            }
            Some(expected_close) => {
                if c == expected_close {
                    if !contains_noise_keyword(&buf, config) {
                        result.push(' ');
                        result.push_str(&buf);
                        result.push(' ');
                    }
                    buf.clear();
                    active_closer = None;
                } else {
                    buf.push(c);
                }
            }
        }
    }

    if pipe_mode {
        if !contains_noise_keyword(&buf, config) {
            result.push(' ');
            result.push_str(&buf);
        }
    }

    result
}

fn contains_noise_keyword(buf: &str, config: &NormalizationConfig) -> bool {
    let lower = buf.to_lowercase();
    config.noise_keywords.iter().any(|kw| lower.contains(kw))
}

fn tokenize(input: &str, config: &NormalizationConfig) -> Vec<String> {
    let bracket_chars = collect_bracket_chars(config);
    let split_chars: HashSet<char> = config.split_chars.iter().copied().collect();
    let trim_chars: HashSet<char> = config.trim_chars.iter().copied().collect();

    let mut seen = HashSet::new();
    let mut result = Vec::new();

    for raw in input.split(|c: char| {
        c.is_whitespace()
            || split_chars.contains(&c)
            || bracket_chars.contains(&c)
    }) {
        let token = trim_token(raw, &trim_chars);

        if token.is_empty() {
            continue;
        }

        if is_trash_token(token, config) {
            continue;
        }

        if !contains_letter(token) {
            continue;
        }

        if is_apostrophe_garbage(token) {
            continue;
        }

        if seen.insert(token) {
            result.push(token.to_string());
        }
    }

    result
}

fn collect_bracket_chars(config: &NormalizationConfig) -> HashSet<char> {
    let mut set = HashSet::new();
    for (open, close) in &config.bracket_pairs {
        set.insert(*open);
        set.insert(*close);
    }
    set
}

fn trim_token<'a>(token: &'a str, trim_chars: &HashSet<char>) -> &'a str {
    token.trim_matches(|c| trim_chars.contains(&c))
}

fn is_trash_token(token: &str, config: &NormalizationConfig) -> bool {
    config.trash_tokens.iter().any(|t| t == token)
}

fn contains_letter(token: &str) -> bool {
    token.chars().any(|c| c.is_alphabetic())
}

fn is_apostrophe_garbage(token: &str) -> bool {
    token.starts_with('\'') || token.ends_with('\'')
}