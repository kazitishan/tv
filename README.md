# tv

A TV-style home screen built with Electron, React and Vite. Streaming sites open inside the app, with ads blocked by [uBlock Origin](https://github.com/gorhill/uBlock).

## Setup

1. **Install Node.js** 20.19 or newer (22+ recommended). Check with:

   ```bash
   node -v
   ```

2. **Clone the project** and go into its folder:

   ```bash
   git clone <repo-url> tv
   cd tv
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

   This also downloads uBlock Origin into `extensions/ublock-origin/`. You should see:

   ```
   uBlock Origin 1.75.4 installed to extensions/ublock-origin
   ```

   If the download failed (for example, you were offline), run it again with:

   ```bash
   npm run fetch:ublock
   ```

4. **Start the app** in development mode, with live reload for the React UI:

   ```bash
   npm run dev
   ```

   Or build and run the production version:

   ```bash
   npm start
   ```
