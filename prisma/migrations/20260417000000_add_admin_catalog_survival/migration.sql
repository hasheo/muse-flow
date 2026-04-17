-- AlterTable
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CatalogTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL,
    "cover" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "year" INTEGER,
    "country" TEXT,
    "category" TEXT,
    "genre" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivalAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "answerMode" TEXT NOT NULL,
    "strikesAllowed" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurvivalAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogTrack_youtubeVideoId_key" ON "CatalogTrack"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "CatalogTrack_category_idx" ON "CatalogTrack"("category");

-- CreateIndex
CREATE INDEX "CatalogTrack_genre_idx" ON "CatalogTrack"("genre");

-- CreateIndex
CREATE INDEX "CatalogTrack_country_idx" ON "CatalogTrack"("country");

-- CreateIndex
CREATE INDEX "CatalogTrack_year_idx" ON "CatalogTrack"("year");

-- CreateIndex
CREATE INDEX "SurvivalAttempt_userId_createdAt_idx" ON "SurvivalAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SurvivalAttempt_score_idx" ON "SurvivalAttempt"("score");

-- AddForeignKey
ALTER TABLE "CatalogTrack" ADD CONSTRAINT "CatalogTrack_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivalAttempt" ADD CONSTRAINT "SurvivalAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
