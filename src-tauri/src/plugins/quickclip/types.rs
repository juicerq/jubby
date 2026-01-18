use serde::{Deserialize, Serialize};

pub const ENCODING_CRF: &str = "18";
pub const ENCODING_PRESET: &str = "slower";

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Default)]
pub enum ResolutionScale {
    #[default]
    #[serde(rename = "720p")]
    P720,
    #[serde(rename = "1080p")]
    P1080,
    #[serde(rename = "480p")]
    P480,
    #[serde(rename = "native")]
    Native,
}

impl ResolutionScale {
    pub fn scale_filter(&self) -> Option<&str> {
        match self {
            ResolutionScale::Native => None,
            ResolutionScale::P1080 => Some("1920:-2"),
            ResolutionScale::P720 => Some("1280:-2"),
            ResolutionScale::P480 => Some("854:-2"),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Default)]
pub enum Framerate {
    #[default]
    #[serde(rename = "30")]
    Fps30,
    #[serde(rename = "60")]
    Fps60,
    #[serde(rename = "120")]
    Fps120,
}

impl Framerate {
    pub fn value(&self) -> u32 {
        match self {
            Framerate::Fps30 => 30,
            Framerate::Fps60 => 60,
            Framerate::Fps120 => 120,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum AudioMode {
    #[default]
    None,
    System,
    Mic,
    Both,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PipeWireCaptureMode {
    #[default]
    Fullscreen,
    Area,
}
