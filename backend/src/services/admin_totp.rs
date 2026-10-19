//! RFC 6238 / RFC 4226: SHA-1, 6 digits, 30 seconds, one step of clock drift.
//! The seed is separate from PostgreSQL. The consumed step is durable and locked
//! for the lifetime of the process: no replay after restart or across instances.
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::{self, Read, Seek, Write},
    path::Path,
};
use subtle::ConstantTimeEq;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Counter {
    secret_id: String,
    last_step: u64,
}
pub struct TotpState {
    last_step: u64,
    file: Option<File>,
    failed: bool,
}
impl Default for TotpState {
    fn default() -> Self {
        Self {
            last_step: 0,
            file: None,
            failed: false,
        }
    }
}
pub fn valid_secret(secret: &str) -> bool {
    secret.len() == 40 && hex::decode(secret).is_ok()
}
fn secret_id(secret: &str) -> String {
    hex::encode(Sha256::digest(hex::decode(secret).unwrap()))
}

pub fn private_file(path: &Path) -> io::Result<()> {
    let info = std::fs::symlink_metadata(path)?;
    if !info.is_file() {
        return Err(io::Error::other("expected a regular private file"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if info.permissions().mode() & 0o077 != 0 {
            return Err(io::Error::other("private file requires chmod 600"));
        }
    }
    Ok(())
}
impl TotpState {
    pub fn open(path: &Path, secret: &str) -> io::Result<Self> {
        private_file(path)?;
        let mut file = OpenOptions::new().read(true).write(true).open(path)?;
        file.try_lock()
            .map_err(|_| io::Error::other("admin state already in use"))?;
        let mut bytes = Vec::new();
        (&mut file).take(513).read_to_end(&mut bytes)?;
        if bytes.len() > 512 {
            return Err(io::Error::other("invalid TOTP state"));
        }
        let counter: Counter = serde_json::from_slice(&bytes)?;
        if counter.secret_id != secret_id(secret) {
            return Err(io::Error::other("TOTP state does not match credentials"));
        }
        Ok(Self {
            last_step: counter.last_step,
            file: Some(file),
            failed: false,
        })
    }
    pub fn consume(&mut self, secret: &str, code: &str, seconds: u64) -> bool {
        if self.failed
            || !valid_secret(secret)
            || code.len() != 6
            || !code.bytes().all(|b| b.is_ascii_digit())
        {
            return false;
        }
        let step = seconds / 30;
        let mut matched = None;
        for candidate in step.saturating_sub(1)..=step.saturating_add(1) {
            let expected = code_at(secret, candidate);
            if bool::from(expected.as_bytes().ct_eq(code.as_bytes())) && candidate > self.last_step
            {
                matched = Some(candidate);
            }
        }
        let Some(next) = matched else {
            return false;
        };
        self.last_step = next;
        if let Some(file) = self.file.as_mut() {
            let data = serde_json::to_vec(&Counter {
                secret_id: secret_id(secret),
                last_step: next,
            })
            .unwrap();
            let persisted = (|| -> io::Result<()> {
                file.rewind()?;
                file.write_all(&data)?;
                file.set_len(data.len() as u64)?;
                file.sync_all()
            })();
            if persisted.is_err() {
                self.failed = true;
                return false;
            }
        }
        true
    }
}
// Public to allow protocol test vectors and isolated integration fixtures, never an endpoint.
pub fn code_at(secret: &str, step: u64) -> String {
    let key = hex::decode(secret).expect("validated TOTP seed");
    let mut mac = Hmac::<Sha1>::new_from_slice(&key).unwrap();
    mac.update(&step.to_be_bytes());
    let bytes = mac.finalize().into_bytes();
    let offset = (bytes[19] & 15) as usize;
    let number = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) & 0x7fff_ffff;
    format!("{:06}", number % 1_000_000)
}

#[cfg(test)]
mod tests {
    use super::*;
    const SECRET: &str = "3132333435363738393031323334353637383930";
    #[test]
    fn rfc4226_and_rfc6238_vectors() {
        for (step, expected) in [
            "755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583",
            "399871", "520489",
        ]
        .iter()
        .enumerate()
        {
            assert_eq!(code_at(SECRET, step as u64), *expected);
        }
        for (time, expected) in [
            (59, "287082"),
            (1111111109, "081804"),
            (1111111111, "050471"),
            (1234567890, "005924"),
            (2000000000, "279037"),
            (20000000000, "353130"),
        ] {
            assert_eq!(code_at(SECRET, time / 30), expected);
        }
    }
    #[test]
    fn drift_expiry_and_replay() {
        for offset in [99, 100, 101] {
            let mut state = TotpState::default();
            let code = code_at(SECRET, offset);
            assert!(state.consume(SECRET, &code, 3000));
            assert!(!state.consume(SECRET, &code, 3000));
            assert!(!state.consume(SECRET, &code_at(SECRET, offset - 1), 3000));
        }
        let mut state = TotpState::default();
        for code in [
            "",
            "12345",
            "1234567",
            "abcdef",
            &code_at(SECRET, 98),
            &code_at(SECRET, 102),
        ] {
            assert!(!state.consume(SECRET, code, 3000));
        }
    }
    #[test]
    fn durable_replay_lock_and_corruption_fail_closed() {
        let path = std::env::temp_dir().join(format!("poduna-totp-test-{}", uuid::Uuid::new_v4()));
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).unwrap();
        file.write_all(
            &serde_json::to_vec(&Counter {
                secret_id: secret_id(SECRET),
                last_step: 0,
            })
            .unwrap(),
        )
        .unwrap();
        drop(file);
        let mut state = TotpState::open(&path, SECRET).unwrap();
        assert!(TotpState::open(&path, SECRET).is_err());
        assert!(state.consume(SECRET, &code_at(SECRET, 100), 3000));
        drop(state);
        let mut state = TotpState::open(&path, SECRET).unwrap();
        assert!(!state.consume(SECRET, &code_at(SECRET, 100), 3000));
        drop(state);
        assert!(TotpState::open(&path, &"ab".repeat(20)).is_err());
        std::fs::write(&path, b"broken").unwrap();
        assert!(TotpState::open(&path, SECRET).is_err());
        std::fs::remove_file(path).unwrap();
    }
}
