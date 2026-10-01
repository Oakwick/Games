# Oakwick Games

Quick monthly games for staff, hosted on GitHub Pages and installable as an app (PWA). Each month's game gets its own folder under `games/`. One shared Google Sheet runs everything else: the player list, the personal invitation links, the Top 10, the end-of-month results emails and the published winning submission.

**October 2026: Line Clear.** Players mark pruning cuts on two trees either side of an 11kV line:

- Tree A needs a 4.5 m side clearance.
- Tree B needs a restricted full crown reduction to 3.0 m.

Every cut is scored against BS 3998 good practice.

The clearance zones aren't drawn while players work. They only get the conductors and a scale bar, so they have to judge the distances themselves. The zones and each player's actual clearances are shown on the results screen. In the cut close-up, players can tap a branch to move the cut onto it, which makes it easier to hit the right one on a small screen.

```
index.html                     Oakwick Games home page (lists this month's game)
manifest.webmanifest, sw.js    App install + offline support
icons/                         App icons
games/2026-10-line-clear/      The game
  config.js                    <- paste your scoreboard URL here
  trees-data.js                Tree geometry (generated, don't edit)
  engine.js                    Scoring rules (shared with the server)
  game.js, index.html, style.css
backend/Code.gs                <- paste this into Google Apps Script
tools/                         Build + test scripts (not needed to run the game)
```

You can open the game straight away. Without a scoreboard URL it runs in **demo mode**: no invitation link is needed, and scores only save on that device. That's handy for trying it out.

---

## 1. Put the site on GitHub Pages (about 5 minutes)

1. Create a new repository on GitHub, e.g. `oakwick-games`. Make it public, because Pages on free accounts needs a public repo.
2. Upload everything in this folder: **Add file → Upload files**, then drag the whole contents in and commit.
3. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, then branch `main` and folder `/ (root)`. Save.
4. After a minute your site is live at `https://<your-username>.github.io/oakwick-games/`.

## 2. Set up the scoreboard (Google Sheet, about 5 minutes)

1. In Google Drive, create a new Google Sheet called **Oakwick Games Scoreboard**. Keep it private, because players never see it.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete what's in `Code.gs`, paste in the whole of `backend/Code.gs`, and click **Save**.
4. Pick `setupSheets` in the function drop-down and click **Run**. Google will ask you to authorise it, including permission to send email as you. Choose your account, then **Advanced → Go to project → Allow**. This creates the *Players*, *Rounds* and *Attempts* tabs.
5. Click **Deploy → New deployment**, then the gear icon → **Web app**. Set:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**. The game needs this to reach the sheet, but people still can't see the sheet itself.
6. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
7. In GitHub, edit `games/2026-10-line-clear/config.js`, paste the URL into `apiUrl: ''`, and commit. The game is now live and the demo banner goes away.

**Which Google account?** Emails are sent from the account that owns the script. A personal Gmail account can send to about **100 recipients a day**, and a Google Workspace (work) account to about 1,500. If you have more than about 100 staff, use a work account. Either way the script keeps track: if it hits the limit, it sends the rest the next day.

## 3. Add players and send the invitations

1. Reload the Google Sheet. An **Oakwick Games** menu appears.
2. On the **Rounds** tab, check the row for `2026-10`:
   - **Game URL** must be your real game address, e.g. `https://<you>.github.io/oakwick-games/games/2026-10-line-clear/`.
   - **Closes** is the date and time the round ends.
3. On the **Players** tab, type each person's **Name** and **Email**, one per row.
4. Choose **Oakwick Games → Create keys for new players**. Each person gets a permanent personal key, which is what their email link uses. To stop someone playing, set **Active** to `N`.
5. Choose **Oakwick Games → Email this month's invitations**. Everyone gets a "Play now" button that signs them in. There's nothing to type, and the name on the scoreboard comes from the Players tab. Running it again only emails people added since.
6. **Email a reminder to players who haven't finished** nudges anyone who hasn't submitted yet.
7. Choose **Oakwick Games → Turn on automatic month-end close** once. From then on, the script checks every hour and closes each round when its closing time passes.

New starters: add them to the Players tab, run **Create keys** and **Email this month's invitations** again.

## How "one attempt" is enforced

- Each player is identified by their personal link. Their attempt starts the moment they press **Start**, and there's only ever one attempt per player per round.
- **Progress is saved to the server** as they go. If they refresh, change phone or switch to a PC, opening their link again picks up exactly where they left off, with the same cuts and the clock still running. It never starts afresh.
- After submitting, any further submissions are rejected.
- **Scores can't be faked.** The browser sends only the list of cuts, and the server re-scores them with the same rules. Any score the browser claims is ignored.
- If an attempt needs wiping (very rare now that progress is saved), use **Oakwick Games → Reset a player's attempt…**. Submitted scores can't be reset.

The one gap: if someone forwards their email, whoever opens the link plays as them. The invitation asks them not to.

## End of the month

When the round closes (automatically at the closing time, or straight away with **Close round & email results now**):

1. No more attempts or saves are accepted.
2. The winner is recorded in the *Rounds* tab. Equal scores are split by the faster time.
3. **Everyone who submitted gets an email** saying who won, their own score and finishing position, and the final Top 10. It includes a button to **see the winning cuts**.
4. The **winning submission is published** on the game page (`…/2026-10-line-clear/?view=winner`). It shows the winner's final image with every cut numbered, the clearances they achieved, and how each cut scored. It's only visible once the round has closed.
5. A **winner card** also appears on the game's front page, linking to it.

**Oakwick Games → Show current Top 3** shows names and emails at any time, so you can check before the prize is awarded.

## Scoring (Line Clear)

Each tree is worth 500 points, for a maximum of 1000.

| Part | Points | What's judged |
|---|---|---|
| Clearance | 200 | Full marks at exactly the target (A: 4.5 m horizontal, B: 3.0 m radial), measured to the nearest vegetation including foliage. Marks drop away with over-cutting (zero at 1.5 m over). Falling short of the clearance halves the marks, and they reach zero at 0.5 m short. |
| Cut quality | 200 | Each cut is scored out of 100 (below), then averaged with bigger cuts counting for more. On Tree A, cuts that don't affect the clearance count half ("no more than necessary"). |
| Crown | 100 | No more than 30% of leaf-bearing material removed. Tree B also needs an even reduction all round, measured across 10 sectors of the crown. |

Each cut is scored out of 100:

| Check | Points | What's judged |
|---|---|---|
| Position | 45 | A removal cut goes just outside the branch collar. A reduction cut goes just beyond a lateral, outside its branch bark ridge. Flush cuts and stubs lose marks, and a heading (internodal) cut scores 0 here. |
| Angle | 20 | The optimum angle for that union: from outside the bark ridge to outside the collar for a removal, or bisecting the ridge and a line square to the stem for a reduction. Full marks within ±8°, zero by ±35°. |
| Proportions | 15 | For a reduction, the retained lateral should be at least ⅓ of the diameter of the removed stem. For a removal, the branch should be no more than ⅓ of the parent stem. The removal check isn't applied to twigs of 40 mm or less. |
| Wound size | 10 | 100 mm or less gets full marks, and 180 mm or more gets none. |
| Technique | 10 | Use the three-cut method on anything over 75 mm. |

All thresholds are in `engine.js` (the `K` block near the top), so you can tune them. If you change them, rebuild `backend/Code.gs` (below) and update the Apps Script as well, otherwise the site and the server will disagree.

*This is a simplified game model based on BS 3998:2010 principles and common line-clearance practice. It isn't a substitute for the standard or company procedures.*

## Making next month's game

1. Copy the game folder to a new one, e.g. `games/2026-11-<name>/`, and build the new game there.
2. Set `round: '2026-11'` (and the labels) in its `config.js`, keeping the same `apiUrl`.
3. Add it to the home page `index.html`, and move October to "Past games". Its winner page stays live.
4. Add the new folder's files to the `SHELL` list in `sw.js` and change `CACHE` (e.g. `oakwick-2026-11-1`).
5. In `backend/server.js`, add an entry to `GAMES` for the new round, then run `node tools/build-backend.js` to rebuild `backend/Code.gs`.
6. In Apps Script, paste the new `Code.gs`, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. This keeps the same URL.
7. In the sheet, run **Oakwick Games → Start a new round…** (ID, title, game URL), then **Email this month's invitations**. Players keep the same keys, so there's nothing for them to set up.

## Developer notes

```
node tools/gen-trees.js        # regenerate the tree geometry (fixed seeds)
node tools/build-backend.js    # rebuild backend/Code.gs from the game engine + server
node tools/test-engine.js      # scoring sanity tests (good vs bad cuts)
node tools/test-backend.js     # one-attempt rules + server re-scoring, in a mocked Apps Script
python3 -m http.server         # then open http://localhost:8000/games/2026-10-line-clear/
```
