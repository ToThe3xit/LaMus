# LaMus - Self-Hosted Discord Music System

LaMus is a high-performance, self-hosted Discord music bot ecosystem designed for ARM architectures (like Raspberry Pi). It features a modern Single Page Application (SPA) WebUI, real-time WebSocket synchronization, and a decentralized instance architecture.

<p align="center">
  <img src="webui/src/assets/logo.png" alt="LaMus Logo" />
</p>

## Features

* **Modern WebUI:** Control your music via a sleek React-based browser interface instead of typing chat commands.
* **Real-Time Sync:** Powered by WebSockets. Actions taken by one user update instantly for everyone else.
* **Multi-Instance Support:** Spawn multiple independent bot instances across different servers dynamically.
* **Local & Network Audio:** Play massive local libraries securely. External network music sources can be enabled manually via Lavalink plugins.
* **CGNAT Bypass:** Built-in Ngrok reverse tunneling allows you to access the WebUI from anywhere, bypassing restrictive ISP firewalls.
* **Highly Optimized:** Written in Rust (Tokio) for near-zero RAM footprint, paired with a memory-capped Lavalink audio engine.

## Tech Stack

* **Backend:** Rust, Tokio (Asynchronous Runtime), Serenity (Discord API)
* **Frontend:** React, Vite, TypeScript
* **Audio Engine:** Lavalink (Java)
* **Infrastructure:** Docker, Docker Compose, Ngrok

---

## Quick Start (Deployment)

Follow these steps to spin up your own LaMus node:

### 1. Preparation
Clone the repository and navigate into it. Create empty database files for the music indexer:

```bash
touch db.yaml
touch tracks_normalized_preview.yaml
```

### 2. Configuration
Remove the .example extension from the configuration files and fill in your private credentials:

* Rename config.example.yaml to config.yaml
  * Add your Discord Bot Tokens, Client ID, Client Secret, and Superadmin ID.
* Rename application.example.yml to application.yml
  * Set your Lavalink password. (Note: External network music sources are disabled by default. Check the configuration file comments to enable them. If you enable the external plugin for YouTube, you will most likely need to connect a Google account—it is highly recommended to use a "burner account" for this to avoid any potential bans).
* Rename webui/.env.example to webui/.env
  * Add your full Ngrok domain (e.g., VITE_API_URL=https://your-url.ngrok-free.app). You will need to register a free account at Ngrok to get your Auth Token and a static domain (paid plans allow multiple domains).

### 3. Add Local Music
Create a folder named tracks in the root directory and drop your .mp3, .flac, or .wav files inside. The bot will automatically scan and index them on startup.

### 4. Build and Run
Make sure you have Docker installed. Edit the docker-compose.yml file to include your Ngrok Auth Token and local machine IP, then run:

```bash
docker compose up -d --build
```

*Note: On some host devices (like Raspberry Pi or fresh Linux installs), you might need to run this initial build command with administrator privileges (e.g., using `sudo docker compose up -d --build`) to ensure system audio drivers and dependencies are installed correctly during the container build process.*

The system will build the React frontend, compile the Rust backend, and spin up the Lavalink node automatically. You can now access your bot via your Ngrok URL!

## Permissions

Only users authenticated via Discord OAuth2 can access the WebUI. Regular users only see bots assigned to servers they are currently in, while Superadmins have global visibility over all active instances.