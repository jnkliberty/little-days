# Security

Little Days keeps a baby's care records, so a mistake here matters. Please report a problem in private.

## Report a problem

Send the details to `<SECURITY CONTACT>` or use GitHub's "Report a vulnerability" button on this repository. Do not open a public issue for a security problem. Say what you did, what you expected, and what happened. The maintainer replies as soon as possible.

## What the app protects

- **One household passcode.** A phone with no session first asks for it. The server stores only a salted `scrypt` hash. A wrong passcode is counted for each address (10 in 15 minutes) and for the whole install (100 in 15 minutes).
- **Sessions.** The server keeps a hash of each session. Setting or resetting the passcode ends every session.
- **Sign-in.** An adult's Baby Buddy password is made by the install, stored only in `data/babybuddy/`, and never shown to a phone. Baby Buddy locks an account after repeated wrong passwords.
- **The default Baby Buddy administrator.** `install.py` disables the `admin` account and checks that its default password no longer works before it goes on.
- **HTTPS.** The app refuses to start with an address that does not start with `https://`.
- **AI is off by default.** With AI off the app makes no call to any AI provider.

## What you must do

- Keep `.env` and `data/` private. They hold the AI key (if you add one), the Baby Buddy account passwords, and every record. Back them up to a place only you can read.
- Choose a passcode that is not used elsewhere. Reset it with `./reset-passcode.sh` when an adult leaves the household.
- Keep the app on a private network, or behind a host name you control. Anyone who knows the passcode and an adult's sign-in name can open the records.
- Update the images from time to time: `git pull`, then `docker compose build gateway` and `docker compose up -d`.

## Known limits

- The limit on wrong passcodes for the whole install can lock family members out while someone guesses. The wait ends after 15 minutes.
- Records are not encrypted at rest. Use disk encryption on the computer that runs the app.
