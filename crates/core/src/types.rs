use serde::{Deserialize, Serialize};

// ============================================================ //
// ==== SHARED DATA TYPES (API / SERIALIZATION) =============== //
// ============================================================ //
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BotInstance {
    pub id: String,
    pub server_name: String,
    pub is_locked: bool,
    pub status: String,
    pub icon_url: Option<String>,
}