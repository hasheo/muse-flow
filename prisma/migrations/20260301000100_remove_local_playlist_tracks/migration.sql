DELETE FROM "PlaylistTrack"
WHERE "sourceType" <> 'youtube'
   OR "youtubeVideoId" IS NULL;

UPDATE "PlaylistTrack"
SET "sourceType" = 'youtube',
    "mimeType" = NULL,
    "sourcePath" = NULL
WHERE "sourceType" = 'youtube';
