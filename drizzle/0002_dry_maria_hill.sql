ALTER TABLE `members` ADD `student_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `members_cycle_student` ON `members` (`cycle_id`,`student_id`);