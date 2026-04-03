-- AlterTable: Add day_night, rate, unit to rate_cards for unified rate structure
ALTER TABLE `rate_cards` ADD COLUMN `day_night` VARCHAR(191) NULL;
ALTER TABLE `rate_cards` ADD COLUMN `rate` DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE `rate_cards` ADD COLUMN `unit` VARCHAR(191) NULL;

-- Migrate existing data: copy day_rate to rate, day_unit to unit for existing records
UPDATE `rate_cards` SET `rate` = `day_rate`, `unit` = `day_unit` WHERE `day_rate` > 0;

-- For records that only have night_rate, copy night_rate to rate and set day_night to '夜'
UPDATE `rate_cards` SET `rate` = `night_rate`, `unit` = `night_unit`, `day_night` = '夜' WHERE `rate` = 0 AND `night_rate` > 0;

-- AlterTable: Add rate column to subcon_rate_cards
ALTER TABLE `subcon_rate_cards` ADD COLUMN `rate` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Migrate existing subcon data: copy day_rate to rate
UPDATE `subcon_rate_cards` SET `rate` = `day_rate` WHERE `day_rate` > 0;

-- For fleet_rate_cards: copy day_rate to rate where rate is 0 but day_rate > 0
UPDATE `fleet_rate_cards` SET `rate` = `day_rate` WHERE `rate` = 0 AND `day_rate` > 0;
