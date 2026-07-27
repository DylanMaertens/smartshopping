use std::{collections::HashMap, fs, io, path::PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DeviceProfile {
    pub device_id: String,
    pub first_seen_at: i64,
    pub last_seen_at: i64,
    pub sync_count: u64,
}

#[derive(Debug)]
pub struct DeviceRegistry {
    path: PathBuf,
    devices: HashMap<String, DeviceProfile>,
}

impl DeviceRegistry {
    pub fn load(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let devices = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Vec<DeviceProfile>>(&raw).ok())
            .map(|profiles| {
                profiles
                    .into_iter()
                    .map(|profile| (profile.device_id.clone(), profile))
                    .collect::<HashMap<_, _>>()
            })
            .unwrap_or_default();

        Self { path, devices }
    }

    pub fn register_sync(&mut self, device_id: &str) -> io::Result<DeviceProfile> {
        let now = Utc::now().timestamp_millis();
        let profile = self
            .devices
            .entry(device_id.to_string())
            .and_modify(|profile| {
                profile.last_seen_at = now;
                profile.sync_count += 1;
            })
            .or_insert_with(|| DeviceProfile {
                device_id: device_id.to_string(),
                first_seen_at: now,
                last_seen_at: now,
                sync_count: 1,
            })
            .clone();

        self.persist()?;
        Ok(profile)
    }

    pub fn get(&self, device_id: &str) -> Option<DeviceProfile> {
        self.devices.get(device_id).cloned()
    }

    fn persist(&self) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut profiles = self.devices.values().cloned().collect::<Vec<_>>();
        profiles.sort_by(|left, right| left.device_id.cmp(&right.device_id));
        let serialized = serde_json::to_string_pretty(&profiles)?;
        fs::write(&self.path, serialized)
    }
}
