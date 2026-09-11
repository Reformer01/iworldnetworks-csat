-- Widen free-text/email columns to fit long Firestore values.
ALTER TABLE `Feedback` MODIFY `customerEmail` VARCHAR(255) NULL;
ALTER TABLE `Feedback` MODIFY `comment` TEXT NULL;
ALTER TABLE `Feedback` MODIFY `resolutionNotes` TEXT NULL;

ALTER TABLE `Customer` MODIFY `email` VARCHAR(255) NULL;
ALTER TABLE `Customer` MODIFY `billingEmail` VARCHAR(255) NULL;

ALTER TABLE `FeedbackToken` MODIFY `customerEmail` VARCHAR(255) NOT NULL;

ALTER TABLE `ChurnSurvey` MODIFY `comment` TEXT NULL;
