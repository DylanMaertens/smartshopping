//! Password only on stdin, never an argument or environment variable.
use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use std::io::{self, Read};
fn main() {
    let mut password = String::new();
    io::stdin()
        .take(1025)
        .read_to_string(&mut password)
        .expect("cannot read password");
    if password.len() < 14 || password.len() > 1024 || password.contains(['\n', '\r']) {
        eprintln!("Password must contain 14–1024 bytes, without line breaks");
        std::process::exit(1);
    }
    let salt = SaltString::encode_b64(uuid::Uuid::new_v4().as_bytes()).unwrap();
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("password hashing failed");
    println!("{hash}");
}
