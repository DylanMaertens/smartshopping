use std::{collections::HashMap, fs, io, path::PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DeviceProfile {
    pub device_id: String,
    pub first_seen_at: i64,
    pub last_seen_at: i64,
    pub sync_count: u64,
    #[serde(default)]
    pub auth_secret: Option<String>,
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
                auth_secret: None,
            })
            .clone();

        self.persist()?;
        Ok(profile)
    }

    pub fn get(&self, device_id: &str) -> Option<DeviceProfile> {
        self.devices.get(device_id).cloned()
    }

    pub fn enroll(&mut self, device_id: &str) -> io::Result<Option<String>> {
        let now = Utc::now().timestamp_millis();
        let profile = self
            .devices
            .entry(device_id.to_string())
            .or_insert_with(|| DeviceProfile {
                device_id: device_id.to_string(),
                first_seen_at: now,
                last_seen_at: now,
                sync_count: 0,
                auth_secret: None,
            });
        if profile.auth_secret.is_some() {
            return Ok(None);
        }
        let secret = crate::services::device_auth::generate_secret();
        profile.auth_secret = Some(secret.clone());
        profile.last_seen_at = now;
        self.persist()?;
        Ok(Some(secret))
    }

    pub fn rotate_secret(&mut self, device_id: &str) -> io::Result<Option<String>> {
        let Some(profile) = self.devices.get_mut(device_id) else {
            return Ok(None);
        };
        if profile.auth_secret.is_none() {
            return Ok(None);
        }
        let secret = crate::services::device_auth::generate_secret();
        profile.auth_secret = Some(secret.clone());
        profile.last_seen_at = Utc::now().timestamp_millis();
        self.persist()?;
        Ok(Some(secret))
    }

    fn persist(&self) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut profiles = self.devices.values().cloned().collect::<Vec<_>>();
        profiles.sort_by(|left, right| left.device_id.cmp(&right.device_id));
        let serialized = serde_json::to_string_pretty(&profiles)?;
        write_private(&self.path, serialized.as_bytes())
    }
}

fn write_private(path: &std::path::Path, contents: &[u8]) -> io::Result<()> {
    use std::io::Write;
    let mut options = fs::OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(contents)
}
