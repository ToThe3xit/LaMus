use serde::{Serialize, Deserialize};

// ============================================================ //
// ==== DATA MODEL FOR DATABASE SERIALIZATION ================= //
// ============================================================ //
#[derive(Debug,Serialize,Deserialize)]
pub struct Database{
    pub version: u8,
    pub generated_at: String,
    pub root: String,
    pub tracks: Vec<Track>,
}

#[derive(Debug,Serialize,Deserialize)]
pub struct Track{
    pub id: String,
    pub title: String,
    pub duration: u32,
    pub file: String,
}