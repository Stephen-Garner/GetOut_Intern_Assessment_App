# Beacon — GetOut Activation Command Center

An internal analytics dashboard for monitoring member activation,
identifying churn risk, and managing retention interventions.

## Quick Start

1. Make sure you have Node.js 18+ installed
2. Download/clone this repository
3. Open a terminal in the `beacon` folder and run:
   ```
   npm install
   npm link
   ```

That's it. Now you can launch Beacon from anywhere:

```
beacon
```

The app will start and open in your browser automatically.

## Alternative: Double-Click Launch (macOS)

Double-click **Beacon.app** in the project folder. It opens Terminal and starts everything for you. You can drag it to your Dock for quick access.

There's also a **Beacon.command** file if you prefer that approach.

## Adding Data

1. Place your CSV file(s) in the `data/` folder
2. In the app, go to Settings
3. Click "Add New Data Source"
4. Select your file and give the workspace a name
5. Click "Import & Create Workspace"

The app will automatically detect columns and create your workspace.

## Requirements

- Node.js 18+
- A modern browser (Chrome, Firefox, Safari, Edge)
- Optional: Claude Code installed for AI-assisted analysis (Phase 3)
