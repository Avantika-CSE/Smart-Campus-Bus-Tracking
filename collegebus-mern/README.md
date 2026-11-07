# CollegeBus Tracking System — Full MERN Stack (Frontend + Backend)

Your existing frontend (unchanged in design/UI) is now connected to a real
**MongoDB + Express + Node** backend, with **Socket.IO** for live bus
tracking. This README tells you exactly what to do to run it.

## 1. Add your MongoDB URL

1. Go into the `backend` folder.
2. Copy `.env.example` to a new file named `.env` in that same folder.
3. Open `.env` and paste your MongoDB connection string into `MONGODB_URI`:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/collegebus?retryWrites=true&w=majority
   ```
   (or `mongodb://127.0.0.1:27017/collegebus` for a local MongoDB install.)
4. Optionally change `JWT_SECRET` to your own random string (any long
   string works — this signs login tokens).

Everything else in `.env.example` already has sensible defaults.

## 2. Install and run

```
cd backend
npm install
npm start
```

That's it — one server does everything:
- Serves your existing frontend (the same HTML/CSS/JS, untouched design)
- Serves the REST API at `/api/...`
- Runs Socket.IO for live tracking
- Auto-opens `http://localhost:5050` in Chrome

The first time it connects to your database, it automatically **seeds**
the same demo data the app shipped with (the Route 1 demo bus, and Routes
5/6/8 with their real drivers and stops). Seeding only happens on a completely
empty database; students are never seeded. If your
database already has data in it, seeding is skipped automatically.

## 3. Logins

**Student** - email + OTP, no password (see "Student login" below). There is
no demo student any more: a student's account is created automatically the
first time they verify an OTP.

**Admin** - registering a NEW admin needs two things:
1. A Unique ID of the form `JIT-ADM-<number>` where the number is **101 or
   more** (no upper limit): `JIT-ADM-101`, `JIT-ADM-102`, `JIT-ADM-250` ...
2. The **Secret Admin Code**. Add this line to `backend/.env` (choose your own
   long secret, tell it only to people who should become admins) and restart
   the server:

       ADMIN_SECRET_CODE=your-own-long-secret

   Without this line no new admin can be registered. Admins who are already
   registered sign in with Name + Unique ID + Email and do not need the code.

**Bus Driver** - drivers are added **by the admin**: Admin panel ->
**Manage Drivers** -> **Add Driver** (name, email, phone, bus number, route
name and the stops in order). Each driver gets a Unique ID `JIT-DRV-201` or
higher (auto-generated, or typed by the admin; no upper limit). The driver
signs in with the Name + Unique ID + Email the admin entered and sees their
own route and stops.

## Using it on a phone

Every page works on a phone, a tablet and a laptop. On a phone the left menu
is hidden behind the **☰** button at the top left; tap it to open every option
(Dashboard, Live Tracking, Routes, My Route, Notifications, Profile,
**Logout**, and all the admin pages), tap outside it or press ✕ to close.
Wide tables scroll sideways inside their box (a small hint says so).

To open the project on a phone while it runs on your laptop:
1. Start the server on the laptop (`npm start` in `backend`).
2. Phone and laptop on the **same wifi**. Find the laptop's address:
   `ipconfig` in a terminal, look for "IPv4 Address" (for example 192.168.1.5).
3. On the phone open `http://192.168.1.5:5050` (your address, port 5050).
   If it does not open, allow Node.js through the Windows Firewall when Windows asks.
(A link made with a tunnelling tool works the same way.)

The map needs internet on the phone (it loads the Leaflet library and the
OpenStreetMap tiles). If the first library server is blocked on a network, the
page automatically tries a second one and shows "Try again" if both fail.

## Student login (email + OTP)

1. The student types their email and presses **Send OTP**.
2. A 6-digit OTP is e-mailed to that address (real e-mail; nothing is shown on screen).
3. The student enters the OTP. If it is right, they are signed in. A brand-new
   email gets an account automatically.
4. A student whose profile is empty sees only the **profile form** (name, roll
   number, phone) until it is saved. After that the normal dashboard opens and
   the profile can be edited any time under **My Profile**.

"Email verified" and "profile complete" are two separate flags on the student.

**Admin and Driver login are unchanged.**

OTP rules (all can be changed in `backend/.env`, defaults shown):
| Rule | Default | Setting |
|---|---|---|
| OTP valid for | 5 minutes | `OTP_TTL_MINUTES` |
| Wrong guesses before the OTP dies | 5 | `OTP_MAX_ATTEMPTS` |
| Wait before asking for another OTP | 60 seconds | `OTP_RESEND_COOLDOWN_SECONDS` |
| OTP mails per email address per hour | 5 | `OTP_MAX_PER_HOUR` |
| OTP mails per visitor (IP) per hour | 20 | `OTP_MAX_PER_HOUR_PER_IP` |
| OTP checks per email per 15 min | 10 | `OTP_VERIFY_PER_15_MIN` |
| OTP checks per visitor (IP) per 15 min | 40 | `OTP_VERIFY_PER_15_MIN_PER_IP` |

Other behaviour: an OTP works once; asking for a new OTP cancels the old one;
only a keyed hash of the OTP is stored (never the code); the page gives the
same answer for every email address, so it never reveals which addresses have
accounts; there is **no fixed or bypass OTP** - if e-mail is not configured the
server says so and nobody can sign in. The request/verify counters in memory
reset when the server restarts; the wrong-guess counter is stored in MongoDB.
Behind a hosting proxy (Render etc.) set `TRUST_PROXY=1`.

### E-mail: Brevo (official API)

OTP e-mails are sent through **Brevo's transactional e-mail API**
(`POST https://api.brevo.com/v3/smtp/email`). It is called only from the
backend (`backend/utils/mailer.js`); the key never reaches the browser.
The sender name shown to students is **College Bus Management**.

**Step 1 - Brevo account:** sign up at brevo.com (a free plan exists; limits
can change, so check Brevo's pricing page). If Brevo asks you to confirm your
email, verify a new device, or activate/approve the account, do that first.

**Step 2 - Verify the sender address (required):** Brevo only sends from an
address you have registered and verified.
1. In Brevo open **Senders, Domains & Dedicated IPs** -> **Senders** -> **Add a sender**.
2. Name: `College Bus Management`. Email: the address students should see as the sender.
3. Brevo e-mails a verification code/link to that address. Open it and confirm.
4. The sender must show as verified before you use it.
Notes: an address on your own domain (for example the college's) delivers better.
A free address such as @gmail.com can work for testing but may land in Spam;
for it to look trustworthy in production use a domain you control (Brevo then
asks you to add DNS records). Brevo's menu names can change a little, so follow
its on-screen help if a name differs.

**Step 3 - Get the API key:** click your account name (top right) ->
**SMTP & API** -> the **API Keys** tab (it may be called "API Keys & MCP") ->
**Generate a new API key** -> give it a name -> **Generate** -> copy it. The key
(it starts with `xkeysib-`) is shown only once; if you lose it, make a new one.
This is the API key, not the SMTP key / master password.

**Step 4 - backend/.env** (these three lines; delete the old `EMAIL_*` lines):

       BREVO_API_KEY=xkeysib-your-real-key
       BREVO_SENDER_EMAIL=the-address-you-verified@example.com
       BREVO_SENDER_NAME=College Bus Management

No spaces around `=`, no quotes. `BREVO_SENDER_NAME` is optional (that is the
default). Brevo lets this name override the sender's default name; if you ever
see Brevo show a different name, set it in Brevo's sender settings too.

**Step 5 - Run and test** (from the `backend` folder):

       npm start                         (no warning about BREVO_API_KEY should appear)
       npm run test-email -- you@example.com     (sends one test mail, no OTP needed)

Then open the login page, type an email you can read, press **Send OTP**,
check the inbox and the Spam folder, and enter the code. Brevo also shows every
message under Transactional -> Logs (https://app.brevo.com/transactional/email/logs).

If it fails, the terminal prints the reason:
| Terminal says | Fix |
|---|---|
| `401 ... API key is wrong` | key wrong/deleted, or a space or quote in `.env` |
| `401 ... Authorised IPs` | Brevo blocked your IP: Security -> Authorised IPs -> add it or turn the restriction off |
| `400 ... not a verified sender` | `BREVO_SENDER_EMAIL` is not verified in Brevo (Step 2) |
| `403` | the Brevo account may still need activation or approval |
| `429` | sending too fast, or the plan's daily limit is used up |
| `Could not reach Brevo` | no internet |
Students never see these details, only "Could not send the email right now".
If a key is ever exposed (screenshot, GitHub), delete it in Brevo and create a new one.

## Existing students: reset to the new login (safe and reversible)

Old students (made by the password system) are **not deleted**. Their old
password sessions stop working at once (they must sign in with an OTP). The
first time they sign in with an OTP, their onboarding is reset **in the same
database record** (same id, same email), so everything that points to them
(for example their saved route choice) stays valid: name, roll number, phone,
department and the old password hash are moved into `previousProfile`, the
profile is marked incomplete, and they fill the profile again.

To reset ALL old students in one go (optional; it also happens one by one at
first login), use the script. Always run the dry run first:

    cd backend
    npm run reset-students                       (dry run: only prints counts)
    npm run reset-students -- --apply --confirm RESET-STUDENT-ONBOARDING

- It writes a JSON **backup** of the affected students to `backend/backups/`
  before changing anything (it contains personal data and is git-ignored; keep it private).
- It never touches admins, drivers, buses, routes, notifications, saved route
  choices or any other collection.
- Running it twice is harmless (already-reset students are skipped).
- Logs show counts only (no names, emails or phone numbers).
- **Undo** (only for students who have not filled the new profile yet):
  `npm run reset-students -- --rollback --apply --confirm ROLLBACK-STUDENT-ONBOARDING`
  (leave out `--apply --confirm ...` for a dry run).
- There is no web page or API that can reset data; it is a command you run on the server.

## Admin search

The search box at the top of the admin pages searches real database records:
- **Students** by name, email, roll number, phone
- **Drivers** by name, Unique ID, email, phone, or their bus number / route
- **Buses** by bus number, route, driver name / ID, phone
- **Routes** by name, title, bus number, driver, start / end point, or any stop

It waits a moment after typing, shows "Searching...", "No results" and error
messages (with Try again), shows a few results per group with **Show more**,
and clicking a result opens the right admin page with that row highlighted.
`GET /api/admin/search?q=...[&type=students|drivers|buses|routes&page=N]` works
for admins only (students and drivers get 403), accepts 2 to 60 plain-text
characters, and never returns passwords.

## Notifications

Each person has their own read / unread state. The red number on the bell and
the menu counts only UNREAD notifications and disappears when there are none.
Opening the Notifications page marks everything as read after a few seconds,
and there is a "Mark all as read" button.

## Map

Live Tracking uses a real street map (Leaflet + OpenStreetMap, free, needs
internet):
- every stop is a **numbered dot** (same numbers as the stop list); hover or
  tap a dot for the stop name
- the blue line follows the **real roads** between the stops (OSRM routing)
- the bus jumps from stop to stop as the route advances
- it all builds **automatically** from the stop names when an admin adds a
  driver, route or bus - no extra step

### Admin: Map Setup (put every stop in the right place)

Admin panel -> **Map Setup**. Pick a route (Previous / Next, or the drop-down),
pick a stop, then do any ONE of these:
- type a place in the search box (e.g. `JIT College Koradi Road`), press
  **Search**, then **Use for stop**
- paste the position from Google Maps (right-click the place, click the numbers
  to copy, paste like `21.1234, 79.0123`) and press **Use**
- click the right spot on the map

Drag a dot to correct it. **Auto** forgets a hand-set position and searches
again. Positions are saved in the database for everyone; students and drivers
never see this page.

Stop positions are searched on OpenStreetMap by name the first time and
remembered in the database. A stop whose position can't be found is skipped;
it is listed on the map and in the admin's Manage Drivers / Manage Routes
table. Fix it by using a more specific name (e.g. add the area), or put the
position in `backend/utils/stopCoordinates.js`.

## What was built

### Backend (`/backend`)
- **Models** (MongoDB/Mongoose): User, AdminSetup, DriverSetup, Bus, Route,
  Notification, Progress (live tracking state), EmailOtp (student login codes, stored hashed), StudentRoute, Settings,
  Geocode / RouteGeometry (map positions).
- **Auth**: JWT-based. Students sign in with an email OTP (no password). Admins/Drivers register once with a Unique ID and then
  sign in with Name + Unique ID + Email — exactly like your frontend's
  existing flow, now backed by a real database instead of localStorage.
- **APIs**: full CRUD for buses, routes, notifications, users, settings,
  student route selection, plus the live-tracking start/end/progress
  endpoints.
- **Live tracking**: when a driver starts their route, the **server**
  advances the bus stop-by-stop every 7 seconds (not the browser), so it
  keeps running even if no one has a tab open, and pushes instant updates
  over **Socket.IO** to every connected Student/Admin/Driver screen.
- **Security**: passwords are hashed with bcrypt; every protected endpoint
  checks a JWT and the user's role; a driver can only start/end their own
  route; an admin can't delete their own account.

### Frontend (`/frontend`)
Your existing HTML, CSS, and page structure are **completely unchanged**.
Only the JavaScript data layer was rewired from localStorage to real API
calls (`js/data.js`, plus the small amount of logic in each page's script
that reads/writes data). Two script tags were added to each page
(`js/api.js` and the Socket.IO client) since those are technically required
to talk to the new backend — nothing visual changed.

## Testing note

Automated tests run the real route and script code against in-memory
stand-ins for MongoDB and the e-mail service: OTP rules, rate limits, role
isolation, profile validation, the student reset script, admin search,
the Brevo mail request. The pages themselves were run in a real headless
Chrome at phone (390 px), tablet (768 px) and laptop (1280 px) sizes, signed
in as student, driver and admin, with sample data from a stand-in server:
the ☰ menu, every menu option, Logout, no sideways scrolling, tables, the
admin search box and its results, the email-OTP login screens and the
first-time profile form. Admin and driver login code is unchanged.

NOT checked (needs your real accounts / internet): a real e-mail arriving from
Brevo, a real MongoDB server, and the map itself (the OpenStreetMap tiles, stop
dots and road line) in a real browser - the test machine had no internet, so
only the map's box and its fallback messages were checked. Please test those
yourself: open Live Tracking on your phone and tell me what you see.

## Project structure

```
collegebus-mern/
├── backend/
│   ├── server.js            (entry point - run this)
│   ├── .env.example          (copy to .env, add your MongoDB URL)
│   ├── config/db.js
│   ├── models/                (Mongoose schemas)
│   ├── routes/                (all REST API endpoints)
│   ├── middleware/auth.js     (JWT verification, role checks)
│   ├── sockets/index.js       (Socket.IO setup)
│   └── utils/                 (JWT helper, validators, seed data, route data)
└── frontend/                  (your existing site - unchanged design)
    ├── index.html, signup.html, 
    ├── student.html, driver.html, admin.html
    ├── css/style.css           (untouched)
    ├── js/                     (data.js rewired to the API; api.js is new)
    └── assets/                 (your logo + bus photo, untouched)
```
