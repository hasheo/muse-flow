# Collaborative Playlists Design Spec

## Overview

Playlist owners can invite other users to collaborate on their playlists. Collaborators can add and remove songs (their own only). Invitations work via email or single-use shareable links.

## Requirements

- Owner invites collaborators by email or by generating a single-use invite link
- Collaborators can add tracks to the playlist
- Collaborators can remove only tracks they personally added
- Each track shows who added it (avatar + name)
- Owner retains full control: edit metadata, delete playlist, reorder tracks, remove any track
- When a playlist is deleted, all collaborator records and invites are cascade-deleted
- No revocation of collaborator access in this version
- Max 20 collaborators per playlist
- Max 50 pending invites per playlist

## Data Model

### New Models

#### PlaylistCollaborator

| Field      | Type     | Notes                          |
|------------|----------|--------------------------------|
| id         | String   | CUID, primary key              |
| playlistId | String   | FK to Playlist                 |
| userId     | String   | FK to User                     |
| joinedAt   | DateTime | Default: now()                 |

- Unique constraint on `[playlistId, userId]`
- `@@index([userId])` for "my collaborations" queries
- `onDelete: Cascade` from Playlist
- `onDelete: Cascade` from User (delete collaborator record when user is deleted)

#### PlaylistInvite

| Field      | Type      | Notes                              |
|------------|-----------|------------------------------------|
| id         | String    | CUID, primary key                  |
| playlistId | String    | FK to Playlist                     |
| type       | InviteType| Enum: `email` or `link`            |
| email      | String?   | Set for email invites, stored lowercase |
| token      | String    | Unique, CUID, used in invite URL   |
| used       | Boolean   | Default: false                     |
| usedById   | String?   | FK to User who accepted            |
| createdAt  | DateTime  | Default: now()                     |
| expiresAt  | DateTime? | Optional expiration                |

- Unique constraint on `token`
- `@@index([email, type, used])` for pending invite discovery
- `onDelete: Cascade` from Playlist
- `onDelete: SetNull` from User on `usedById` (keep invite record, null out user reference)
- Prisma enum: `enum InviteType { email link }`

### Modified Models

#### PlaylistTrack

- Add `addedById String?` — FK to User, nullable for backwards compatibility with existing tracks
- Add relation `addedBy User?`
- `onDelete: SetNull` from User on `addedById` (keep the track, null out attribution if user is deleted)
- On upsert: `addedById` is only set in the `create` branch, not updated in the `update` branch (original adder retains attribution)

#### Playlist

- Add relation `collaborators PlaylistCollaborator[]`
- Add relation `invites PlaylistInvite[]`

#### User

- Add relation `collaborations PlaylistCollaborator[]`
- Add relation `usedInvites PlaylistInvite[]`
- Add relation `addedTracks PlaylistTrack[]`

## API Routes

### New Endpoints

#### `POST /api/playlists/[id]/invites`

Create an invite. Owner only. Rate-limited via existing `playlist-write` limiter.

**Request body (validated with Zod):**
```json
{ "type": "email", "email": "user@example.com" }
```
or
```json
{ "type": "link" }
```

**Response:** `201` with invite object. For link invites, includes `token` and full invite URL. For email invites, token is omitted.

**Validation:**
- Owner only
- Can't invite yourself
- Can't invite someone who's already a collaborator
- For email invites: can't create duplicate pending invite for same email (case-insensitive)
- Email is normalized to lowercase before storing
- Max 50 pending invites per playlist, return `422` if exceeded
- Zod validates `type` as `z.enum(["email", "link"])`

#### `GET /api/playlists/[id]/invites`

List pending invites. Owner only.

**Response:** Array of invite objects with type, email (if applicable), token (for link invites only), createdAt, used status.

#### `GET /api/invites/pending`

Fetch pending email invites for the authenticated user. Matches by email (case-insensitive).

**Response:** Array of invite objects including playlist name, cover, owner name, and token. Filters: `type = "email"`, `email = session.user.email` (case-insensitive), `used = false`, and `expiresAt` not in the past (if set).

#### `DELETE /api/invites/[token]`

Decline an invite. Authenticated user only.

**Validation:**
- Token must exist and not be used
- For email invites: declining user's email must match invite email (case-insensitive)
- For link invites: only the intended recipient could decline (but link invites are typically just ignored, so this primarily serves email invites)

**Side effects:**
- Marks invite `used = true` (prevents re-use)

**Response:** `200`

#### `POST /api/playlists/invite/[token]`

Accept an invite. Any authenticated user.

**Validation:**
- Token must exist and not be used
- If `expiresAt` is set and in the past, return `410 Gone`
- For email invites: accepting user's email must match invite email (case-insensitive)
- User can't already be a collaborator
- User can't be the playlist owner
- Max 20 collaborators per playlist, return `422` if exceeded

**Side effects:**
- Creates `PlaylistCollaborator` record
- Sets invite `used = true` and `usedById`

**Response:** `200` with playlist summary.

**Rate limiting:** Own rate limiter to prevent token brute-forcing.

#### `GET /api/playlists/[id]/collaborators`

List collaborators. Owner and collaborators only.

**Response:** Array of collaborator objects with user name, email, image, joinedAt. Does not include the owner (owner info is already on the playlist object).

### Modified Endpoints

#### `POST /api/playlists/[id]/tracks`

- Allow collaborators (in addition to owner)
- Set `addedById` to the authenticated user's ID (only in `create` branch of upsert, not `update`)

#### `DELETE /api/playlists/[id]/tracks`

- Allow collaborators (in addition to owner)
- Owner can remove any track
- Collaborators can only remove tracks where `addedById` matches their user ID
- Return `403` if collaborator tries to remove someone else's track

#### `GET /api/playlists/[id]`

- Allow collaborators to view
- Include `addedBy` info (name, image) on each track in response
- Include `role` field: `"owner"` or `"collaborator"`
- Public quiz access remains read-only for non-owner, non-collaborator users (no track operations)

#### `GET /api/playlists`

- Include playlists the user collaborates on
- Each playlist includes a `role` field: `"owner"` or `"collaborator"`

### Unchanged Endpoints (Owner Only)

- `PATCH /api/playlists/[id]` — Edit metadata
- `DELETE /api/playlists/[id]` — Delete playlist (cascades collaborators + invites)
- `PATCH /api/playlists/[id]/tracks` — Reorder tracks
- `POST /api/playlists/[id]/clone` — Clone public quiz playlists (unchanged; cloned tracks get `addedById` set to the cloning user; collaboration status is not carried over)

## Invite Flows

### Email Invite Flow

1. Owner enters email in "Manage Collaborators" dialog
2. `POST /api/playlists/[id]/invites` with `{ type: "email", email: "..." }`
3. Server normalizes email to lowercase, creates `PlaylistInvite` record with unique token
4. No email is sent (out of scope) — invite is stored server-side
5. When invited user logs in with that email, `GET /api/invites/pending` returns their pending invites, shown in library view
6. User accepts or declines invite via the corresponding endpoint
7. On accept: `PlaylistCollaborator` record is created, invite marked used

### Link Invite Flow

1. Owner clicks "Generate Invite Link" in the dialog
2. `POST /api/playlists/[id]/invites` with `{ type: "link" }`
3. Server returns URL: `/invite/[token]`
4. Owner copies link and shares it manually
5. Recipient opens link, lands on `/invite/[token]` page
6. If authenticated: page shows playlist info and "Accept" button, calls `POST /api/playlists/invite/[token]`
7. If not authenticated: redirect to sign-in with return URL back to invite page
8. Invite marked used, `PlaylistCollaborator` created

### Invite Expiration

- Link invites expire after 7 days by default (server sets `expiresAt` on creation)
- Email invites do not expire by default
- On acceptance: if `expiresAt` is set and in the past, return `410 Gone`

## UI Changes

### Playlist Detail View (`playlist-detail-view.tsx`)

- **Owner view:** Add "Manage Collaborators" button opening a dialog
- **Collaborator view:** Show "Add Songs" button (using existing `ManageTracksDialog`). Hide edit metadata, delete, and reorder controls.
- **Track attribution:** Each track displays a small avatar + name of who added it. Null `addedById` shows nothing (legacy tracks).
- **Remove button:** Collaborators see remove button only on their own tracks. Owner sees it on all tracks.

### Manage Collaborators Dialog (new component)

- Section for "Invite by Email" — email text input + invite button
- Section for "Invite by Link" — generate button + copy-to-clipboard
- List of current collaborators (name, email, avatar, joined date)
- List of pending invites (type, email/link, created date, token-based URL for link invites)

### Library View (`library-view.tsx`)

- Section or tab for "Collaborative Playlists" showing playlists the user collaborates on
- Collaborative playlists display the owner's name and a collaborator badge
- "Pending Invites" section showing email invites for the logged-in user, with accept/decline buttons

### Invite Accept Page (`/invite/[token]`)

- New page at `/invite/[token]`
- Shows playlist name, cover, owner name
- "Accept Invite" button
- Handles redirect to sign-in if not authenticated
- Shows error state for expired or already-used invites

## Cascade & Deletion Behavior

### Playlist Deleted

All `PlaylistTrack`, `PlaylistCollaborator`, and `PlaylistInvite` records cascade-deleted.

### User Deleted

- `PlaylistCollaborator` records for the user are cascade-deleted
- `PlaylistTrack.addedById` is set to null (track remains, attribution removed)
- `PlaylistInvite.usedById` is set to null (invite record remains for audit)

### Collaborator Removed (Future — TBD)

Not in scope for this version. When collaborator removal is implemented, a design decision is needed: whether to delete the collaborator's tracks or orphan them (set `addedById = null`). The current user preference is to delete them, but this should be revisited when the feature is built.

## Security & Access Control

### Authorization Matrix

| Action                 | Owner | Collaborator | Other (public quiz) | Other (no access) |
|------------------------|-------|--------------|---------------------|--------------------|
| View playlist          | Yes   | Yes          | Yes (read-only)     | No                 |
| Edit metadata          | Yes   | No           | No                  | No                 |
| Delete playlist        | Yes   | No           | No                  | No                 |
| Add tracks             | Yes   | Yes          | No                  | No                 |
| Remove any track       | Yes   | No           | No                  | No                 |
| Remove own tracks      | Yes   | Yes          | No                  | No                 |
| Reorder tracks         | Yes   | No           | No                  | No                 |
| Create invites         | Yes   | No           | No                  | No                 |
| List invites           | Yes   | No           | No                  | No                 |
| List collaborators     | Yes   | Yes          | No                  | No                 |
| Accept invite          | N/A   | N/A          | Yes (with valid token) | Yes (with valid token) |
| Decline invite         | N/A   | N/A          | Yes (email match)   | Yes (email match)  |

### Invite Security

- Tokens are CUIDs — random and unguessable
- Email invites: accepting user's email must match invite email (case-insensitive comparison)
- Email addresses are normalized to lowercase on storage
- Link invites: any authenticated user can accept (single-use prevents abuse)
- Link invites expire after 7 days
- Owner can't invite themselves
- Duplicate collaborator check before creating record
- Max 20 collaborators per playlist
- Max 50 pending invites per playlist
- Invite creation uses existing `playlist-write` rate limiter
- Invite acceptance has its own rate limit to prevent token brute-forcing
