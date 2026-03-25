use std::collections::HashMap;
use image::{RgbaImage, Rgba};
use tauri::image::Image as TauriImage;

use super::TrayState;

/// Pre-composited icon RGBA data for each tray state.
pub struct IconSet {
    variants: HashMap<TrayState, Vec<u8>>,
    /// For recording pulse: a dimmer variant of the recording icon
    recording_dim: Vec<u8>,
    width: u32,
    height: u32,
}

impl IconSet {
    /// Load base icon from the app's icon path and composite all variants.
    pub fn new(base_icon_bytes: &[u8]) -> Result<Self, String> {
        let base = image::load_from_memory(base_icon_bytes)
            .map_err(|e| format!("Failed to load base icon: {}", e))?
            .to_rgba8();
        let (w, h) = base.dimensions();

        let mut variants = HashMap::new();

        // Idle: base icon unchanged
        variants.insert(TrayState::Idle, base.as_raw().clone());

        // Recording: red dot badge bottom-right
        let recording = Self::add_circle_badge(&base, Rgba([239, 68, 68, 255]));
        variants.insert(TrayState::Recording, recording.as_raw().clone());

        // Recording dim: red dot badge with lower opacity (for pulse animation)
        let recording_dim = Self::add_circle_badge(&base, Rgba([239, 68, 68, 140]));

        // Muted: amber square badge bottom-right
        let muted = Self::add_square_badge(&base, Rgba([245, 158, 11, 255]));
        variants.insert(TrayState::Muted, muted.as_raw().clone());

        // AI Processing: blue dot badge bottom-right
        let ai = Self::add_circle_badge(&base, Rgba([59, 130, 246, 255]));
        variants.insert(TrayState::AiProcessing, ai.as_raw().clone());

        // Stealth: desaturated base + muted red dot
        let mut stealth_base = Self::desaturate(&base);
        Self::draw_circle_badge(&mut stealth_base, Rgba([239, 68, 68, 140]));
        variants.insert(TrayState::Stealth, stealth_base.as_raw().clone());

        // Indexing: green progress bar at bottom
        let indexing = Self::add_progress_bar(&base, Rgba([34, 197, 94, 255]), 0.6);
        variants.insert(TrayState::Indexing, indexing.as_raw().clone());

        Ok(Self {
            variants,
            recording_dim: recording_dim.as_raw().clone(),
            width: w,
            height: h,
        })
    }

    /// Get the icon bytes for a given state.
    pub fn get(&self, state: TrayState) -> TauriImage<'_> {
        let bytes = self.variants.get(&state).expect("All states pre-composited");
        TauriImage::new_owned(bytes.clone(), self.width, self.height)
    }

    /// Get the dim recording variant (for pulse animation).
    pub fn get_recording_dim(&self) -> TauriImage<'_> {
        TauriImage::new_owned(self.recording_dim.clone(), self.width, self.height)
    }

    // -- Private compositing helpers --

    fn add_circle_badge(base: &RgbaImage, color: Rgba<u8>) -> RgbaImage {
        let mut img = base.clone();
        Self::draw_circle_badge(&mut img, color);
        img
    }

    fn draw_circle_badge(img: &mut RgbaImage, color: Rgba<u8>) {
        let (w, h) = img.dimensions();
        let radius = (w.min(h) / 5) as i32; // ~6px on 32x32
        let cx = (w as i32) - radius - 1;
        let cy = (h as i32) - radius - 1;

        for y in (cy - radius)..=(cy + radius) {
            for x in (cx - radius)..=(cx + radius) {
                if (x - cx).pow(2) + (y - cy).pow(2) <= radius.pow(2) {
                    if x >= 0 && y >= 0 && (x as u32) < w && (y as u32) < h {
                        img.put_pixel(x as u32, y as u32, color);
                    }
                }
            }
        }
    }

    fn add_square_badge(base: &RgbaImage, color: Rgba<u8>) -> RgbaImage {
        let mut img = base.clone();
        let (w, h) = img.dimensions();
        let size = w.min(h) / 4; // ~8px on 32x32
        let x0 = w - size - 1;
        let y0 = h - size - 1;

        for y in y0..(y0 + size) {
            for x in x0..(x0 + size) {
                if x < w && y < h {
                    img.put_pixel(x, y, color);
                }
            }
        }
        // Draw slash (diagonal line)
        for i in 0..size {
            let sx = x0 + i;
            let sy = y0 + size - 1 - i;
            if sx < w && sy < h {
                img.put_pixel(sx, sy, Rgba([26, 26, 46, 255])); // dark slash
            }
        }
        img
    }

    fn desaturate(img: &RgbaImage) -> RgbaImage {
        let mut out = img.clone();
        for pixel in out.pixels_mut() {
            let avg = ((pixel[0] as u16 + pixel[1] as u16 + pixel[2] as u16) / 3) as u8;
            // Blend 70% toward grayscale
            pixel[0] = ((pixel[0] as u16 * 30 + avg as u16 * 70) / 100) as u8;
            pixel[1] = ((pixel[1] as u16 * 30 + avg as u16 * 70) / 100) as u8;
            pixel[2] = ((pixel[2] as u16 * 30 + avg as u16 * 70) / 100) as u8;
        }
        out
    }

    fn add_progress_bar(base: &RgbaImage, color: Rgba<u8>, fill: f32) -> RgbaImage {
        let mut img = base.clone();
        let (w, h) = img.dimensions();
        let bar_h = 3u32;
        let margin = 4u32;
        let bar_w = w - margin * 2;
        let fill_w = (bar_w as f32 * fill) as u32;
        let y0 = h - bar_h - 1;

        for y in y0..(y0 + bar_h) {
            for x in margin..(margin + bar_w) {
                if y < h && x < w {
                    let c = if x < margin + fill_w {
                        color
                    } else {
                        Rgba([60, 60, 60, 200])
                    };
                    img.put_pixel(x, y, c);
                }
            }
        }
        img
    }
}
