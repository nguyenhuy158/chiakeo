CREATE TABLE `chiakeo_device_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`user_id` text,
	`approved_at` text,
	`encrypted_token` text,
	`last_polled_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `chiakeo_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chiakeo_device_codes_user_code_unique` ON `chiakeo_device_codes` (`user_code`);