# YouTube Hide Watched Videos

A userscript that hides videos you have already finished watching on YouTube, with an on/off switch in the top bar.

## Features

- Hides fully watched videos (progress bar at 100%) on Home, Subscriptions, Search, channel pages, and the watch page sidebar.
- Hides repeated copies of the same video within a list, which YouTube sometimes loads twice.
- Adds a "Hide watched" switch directly left of the Create button. Your choice is remembered.
- Leaves Watch History alone so that page is not emptied.
- Works in Firefox and Chrome with Violentmonkey.

## Install

1. Install a userscript manager such as [Violentmonkey](https://violentmonkey.github.io/).
2. Open the script: [yt-hide-watched.user.js](https://raw.githubusercontent.com/n3yne/yt-hide-watched/main/yt-hide-watched.user.js)
3. Confirm the install in your userscript manager.
4. Reload YouTube.

The script includes an update URL, so your userscript manager can pick up new versions from this repo.

## Usage

- Click the "Hide watched" switch to turn hiding on or off. Turning it off brings every hidden video back.
- Hover over the switch to see how many fully watched videos and repeats were found on the current page.
- If the top bar is not available, such as on the mobile site, the switch appears as a small floating pill at the bottom left.

## Configuration

Edit the constants near the top of the script:

- `THRESHOLD`: watched percentage at or above which a video is hidden. Default is 100.
- `EXCLUDED_PATHS`: pages where hiding is skipped. Default is Watch History.
- `HIDE_DUPLICATES`: set to `false` to stop hiding repeated copies of a video.

## Notes

- The script relies on the red progress bar YouTube draws on thumbnails, so it only sees videos watched while signed in with watch history turned on.
- YouTube changes its page markup from time to time. If the script stops working, please open an issue.

## Author

Esscey ([n3yne](https://github.com/n3yne))
