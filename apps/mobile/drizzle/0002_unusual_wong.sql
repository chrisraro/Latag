ALTER TABLE `sessions` ADD `location_name` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `sessions` ADD `lng` real;--> statement-breakpoint
ALTER TABLE `sessions` ADD `scheduled_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `reminder_offsets` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `reminder_notification_ids` text;