use axum::{
    extract::{Query, State},
    response::{Redirect, IntoResponse},
    routing::get,
    Router,
};

use serde::Deserialize;
use std::sync::Arc;
use tower_cookies::{Cookie, Cookies};

// ============================================================ //
// ==== DATA STRUCTURES AND AUTHENTICATION STATE ============== //
// ============================================================ //
#[derive(Clone)]
pub struct AuthState {
    pub client_id: Arc<String>,
    pub client_secret: Arc<String>,
    pub redirect_uri: Arc<String>,
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: String,
}

#[derive(Deserialize, Debug)]
pub struct DiscordTokenResponse {
    pub access_token: String,
    pub token_type: String,
}

#[derive(Deserialize, Debug)]
pub struct DiscordUser {
    pub id: String,
    pub username: String,
    pub avatar: Option<String>,
}

// ============================================================ //
// ==== ENDPOINT ROUTER (AXUM) ================================ //
// ============================================================ //
pub fn auth_router(client_id: String, client_secret: String, redirect_uri: String) -> Router {
    let state = AuthState {
        client_id: Arc::new(client_id),
        client_secret: Arc::new(client_secret),
        redirect_uri: Arc::new(redirect_uri),
    };

    Router::new()
        .route("/login", get(login_handler))
        .route("/callback", get(callback_handler))
        .with_state(state)
}

// ============================================================ //
// ==== LOGIN HANDLER (OAUTH2 REDIRECT) ======================= //
// ============================================================ //
async fn login_handler(State(state): State<AuthState>) -> Redirect {
    let url = format!(
        "https://discord.com/api/oauth2/authorize?client_id={}&redirect_uri={}&response_type=code&scope=identify%20guilds",
        state.client_id,
        urlencoding::encode(&state.redirect_uri)
    );
    
    Redirect::temporary(&url)
}

// ============================================================ //
// ==== CALLBACK HANDLER (TOKEN EXCHANGE AND SESSION) ========= //
// ============================================================ //
async fn callback_handler(
    State(state): State<AuthState>,
    Query(query): Query<CallbackQuery>,
    cookies: Cookies,
) -> impl IntoResponse {
    let code = query.code;

    let client = reqwest::Client::new();
    
    let params = [
        ("client_id", state.client_id.as_str()),
        ("client_secret", state.client_secret.as_str()),
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", state.redirect_uri.as_str()),
    ];

    let token_res = client.post("https://discord.com/api/oauth2/token")
        .form(&params)
        .send()
        .await
        .expect("Discord communication error while fetching token");

    if !token_res.status().is_success() {
        println!("[AUTH-ERR] OAuth2 token verification error: {:?}", token_res.text().await);
        return Redirect::temporary("/?error=auth_failed").into_response();
    }

    let token_data: DiscordTokenResponse = token_res.json().await.expect("Error parsing JSON with token");

    let user_res = client.get("https://discord.com/api/users/@me")
        .bearer_auth(&token_data.access_token)
        .send()
        .await
        .expect("Discord communication error while fetching user");

    let user_data: DiscordUser = user_res.json().await.expect("Error parsing JSON with user");

    println!("[AUTH] Successfully authenticated user: {} (ID: {})", user_data.username, user_data.id);

    let mut session_cookie = Cookie::new("mbv2_session", user_data.id.clone());
    session_cookie.set_path("/");
    session_cookie.set_http_only(true);
    cookies.add(session_cookie);

    let avatar_hash = user_data.avatar.unwrap_or_default();
    let avatar_url = if avatar_hash.is_empty() {
        "https://cdn.discordapp.com/embed/avatars/0.png".to_string()
    } else {
        format!("https://cdn.discordapp.com/avatars/{}/{}.png", user_data.id, avatar_hash)
    };

    let redirect_url = format!(
        "/?user_id={}&username={}&avatar={}",
        user_data.id,
        urlencoding::encode(&user_data.username),
        urlencoding::encode(&avatar_url)
    );
    Redirect::temporary(&redirect_url).into_response()
}