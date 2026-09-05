CREATE TABLE `applicant_pii` (
	`applicant_id` integer PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`smu_email` text,
	`student_id` text NOT NULL,
	`contact_number` text,
	`telegram` text,
	`linkedin_url` text,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `applicants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`public_ref` integer NOT NULL,
	`industry_1` text NOT NULL,
	`industry_2` text,
	`faculty` text,
	`faculty_2` text,
	`gender` text,
	`prior_mentee` integer DEFAULT false NOT NULL,
	`linkedin_status` text NOT NULL,
	`submitted_at` integer,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `applicants_pool` ON `applicants` (`cycle_id`,`industry_1`);--> statement-breakpoint
CREATE UNIQUE INDEX `applicants_cycle_ref` ON `applicants` (`cycle_id`,`public_ref`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`cycle_id` integer NOT NULL,
	`industry` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignments_user_cycle_industry` ON `assignments` (`user_id`,`cycle_id`,`industry`);--> statement-breakpoint
CREATE TABLE `claims` (
	`applicant_id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`claimed_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cycles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`column_mapping` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`key` text NOT NULL,
	`prompt` text NOT NULL,
	`display_order` integer NOT NULL,
	`is_rated` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_cycle_key` ON `questions` (`cycle_id`,`key`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`applicant_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ratings_user_applicant_question` ON `ratings` (`user_id`,`applicant_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`applicant_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`answer_text` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_applicant_question` ON `responses` (`applicant_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`role` text DEFAULT 'reviewer' NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verdicts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`applicant_id` integer NOT NULL,
	`overall` text,
	`red_flag` integer DEFAULT false NOT NULL,
	`red_flag_reason` text,
	`note` text,
	`submitted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verdicts_user_applicant` ON `verdicts` (`user_id`,`applicant_id`);