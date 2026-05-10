use std::sync::Mutex;

use crate::models::Config;

pub struct AppState {
    pub config: Mutex<Config>,
}
