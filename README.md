# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

## Daily data refresh

Four production fallback datasets are refreshed from a dedicated Windows clone every day at 06:00 local time. Install or replace the scheduled runner once from the primary repository, passing an existing readable environment file:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-refresh-runner.ps1 -EnvironmentFile C:\Users\farkh\asuhockeywebsite\.env
```

The installer requires Git, Node/npm, an authenticated GitHub CLI (`gh auth status`), and permission to register a Scheduled Task. It clones or updates an isolated runner, runs `npm ci`, copies the environment file without displaying its contents, writes the `.refresh-runner` safety marker, and registers `ASU Hockey Data Refresh` with wake, network, and missed-start handling. Never point the runner at the working repository, inside it, or at one of its parent directories.

Each run executes `npm run refresh-data` and permits commits containing exactly these four generated files:

- `data/asu_alumni_fallback.json`
- `data/asu_transfers_fallback.json`
- `data/asu_recruiting_fallback.json`
- `data/nchc_standings_fallback.json`

Each refresh validates its complete snapshot before atomically replacing the previous fallback. Recruiting uses a direct all-season scrape that cannot recover from cache or fallback data, so any failed season makes the run fail without publishing a partial snapshot. When validated data is unchanged, the run exits successfully without a commit or pull request.

Inspect the latest task result with:

```powershell
Get-ScheduledTaskInfo -TaskName 'ASU Hockey Data Refresh'
```

Detailed runner output is appended to `.refresh-log.txt`. The Sentry Cron Monitor is the dead-man's switch for successful daily executions, including no-op runs; configure it for daily 06:00 America/Phoenix with an approximately 12-hour grace period using `SENTRY_CRON_MONITOR_URL`.

At season rollover, update `config.FUTURE_SEASONS` in `config/scraper-config.js` so recruiting refreshes query the intended future classes.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

## Data Refresh

Elite Prospects data for alumni, transfers, and projected future teams is bundled in the repository as fallback JSON. Production and prerendering read these bundled files instead of making Elite Prospects requests. The projected Arizona State future-team seasons currently tracked are `2027-28` and `2028-29`.

Run the following from a local machine to refresh the bundled data:

```bash
npm run refresh-data        # all bundled fallbacks
npm run refresh-alumni      # alumni only
npm run refresh-transfers   # transfers only
npm run refresh-recruiting  # projected future team rosters only
npm run refresh-standings   # latest played-season NCHC table only
```

`/api/recruits` reads `data/asu_recruiting_fallback.json`. `asu_hockey_data.json.recruiting` remains available only for current-roster profile enrichment; it is not the source for that API response.

Production serves `data/nchc_standings_fallback.json` when USCHO has no current NCHC table or every overall record is `0-0-0`, and switches after the first completed game by any NCHC member.

`npm run refresh-recruiting` performs a direct, uncached all-season scrape and enables Puppeteer request fallback by default, allowing a residential machine to retry Elite Prospects 403 responses through headless Chrome. It never treats cached or bundled data as a successful live refresh. The command refuses to run when `NODE_ENV=production` or `IS_PRERENDER=true`, preserving the existing bundled snapshot in those environments.
