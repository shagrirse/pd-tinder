ALTER TABLE `cycles` ADD `preferences_closed_at` integer;
--> statement-breakpoint
UPDATE `cycles` SET `preferences_closed_at` = unixepoch()
WHERE EXISTS (
	SELECT 1 FROM `member_tokens` mt
	JOIN `members` m ON m.`id` = mt.`member_id`
	WHERE m.`cycle_id` = `cycles`.`id`
)
AND NOT EXISTS (
	SELECT 1 FROM `member_tokens` mt
	JOIN `members` m ON m.`id` = mt.`member_id`
	WHERE m.`cycle_id` = `cycles`.`id`
	AND mt.`id` = (SELECT max(`id`) FROM `member_tokens` WHERE `member_id` = mt.`member_id`)
	AND mt.`expires_at` > unixepoch()
);
