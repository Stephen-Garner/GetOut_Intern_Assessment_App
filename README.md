# Beacon — GetOut Activation Command Center

An internal analytics dashboard for monitoring member activation,
identifying churn risk, and managing retention interventions.

## Download

Go to the [latest release](https://github.com/Stephen-Garner/GetOut_Intern_Assessment_App/releases/latest) and download the installer for your platform:

- **Mac**: `Beacon-x.x.x-mac.dmg`
- **Windows**: `Beacon-x.x.x-win-setup.exe`
- **Linux**: `Beacon-x.x.x-linux.AppImage`

The app updates automatically when new versions are published.

## First Launch

1. Open Beacon
2. Go to Settings
3. Place your CSV files in the data folder:
   - Mac/Linux: `~/Documents/Beacon/data/`
   - Windows: `Documents\Beacon\data\`
4. Create a workspace from your CSV
5. Start analyzing

## Development

If you want to run from source:

```bash
git clone https://github.com/Stephen-Garner/GetOut_Intern_Assessment_App.git
cd GetOut_Intern_Assessment_App
npm install
npm run beacon        # Dev mode (browser)
npm run electron:dev  # Dev mode (Electron window)
npm run dist          # Build installer for your platform
```

## Publishing a New Release

1. Update the version in `package.json`
2. Commit and tag: `git tag v1.1.0`
3. Push with tags: `git push --tags`
4. GitHub Actions builds for Mac, Windows, and Linux and attaches installers to the release

## Requirements (for development only)

- Node.js 18+
- npm 9+
