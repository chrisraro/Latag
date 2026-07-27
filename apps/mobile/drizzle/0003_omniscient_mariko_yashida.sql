CREATE TABLE `publish_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`op` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `published_at` integer;--> statement-breakpoint
ALTER TABLE `items` ADD `shop_code` text;