// ============================================================ //
// ==== TRACK DATA AND SOURCE REPRESENTATION ================== //
// ============================================================ //
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackId(pub String);

impl From<String> for TrackId{
    fn from(value: String) -> Self{
        TrackId(value)
    }
}
impl From<&str> for TrackId{
    fn from(value:&str) -> Self{
        TrackId(value.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AudioSource{
    Local,
    Lavalink,
}

#[derive(Debug, Clone)]
pub struct Track{
    pub id: TrackId,
    pub title: String,
    pub duration_seconds: u64,
    pub source: AudioSource,
    pub file_path: Option<String>,
    pub lavalink_id: Option<String>,
}

impl Track{
    pub fn local(
        id: impl Into<TrackId>,
        title: impl Into<String>,
        duration_seconds: u64,
        file_path: impl Into<String>,
    ) -> Self{
        Self{
            id: id.into(),
            title: title.into(),
            duration_seconds,
            source: AudioSource::Local,
            file_path: Some(file_path.into()),
            lavalink_id: None,
        }
    }

    pub fn lavalink(
        id: impl Into<TrackId>,
        title: impl Into<String>,
        duration_seconds: u64,
        lavalink_id: impl Into<String>,
    ) -> Self {
        Self{
            id: id.into(),
            title: title.into(),
            duration_seconds,
            source: AudioSource::Lavalink,
            file_path: None,
            lavalink_id: Some(lavalink_id.into()),            
        }
    }
}