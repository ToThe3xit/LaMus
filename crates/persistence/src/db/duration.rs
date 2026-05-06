use std::path::Path;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::default::get_probe;

// ============================================================ //
// ==== AUDIO METADATA READING ABSTRACTION (SYMPHONIA) ======== //
// ============================================================ //
pub fn get_duration_seconds(path: &Path) -> Option<u32>{
    let file = std::fs::File::open(path).ok()?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let probed = get_probe()
        .format(
            &Default::default(),
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .ok()?;

    let format = probed.format;
    let track = format.default_track()?;

    let params = track.codec_params.clone();
    let frames = params.n_frames?;
    let sample_rate = params.sample_rate?;

    Some((frames / sample_rate as u64) as u32)
}