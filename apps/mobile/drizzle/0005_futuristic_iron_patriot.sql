PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`brand` text NOT NULL,
	`name` text,
	`department` text DEFAULT 'tops' NOT NULL,
	`category` text NOT NULL,
	`ptp_inches` real,
	`length_inches` real,
	`sleeve_inches` real,
	`waist_inches` real,
	`inseam_inches` real,
	`rise_inches` real,
	`leg_opening_inches` real,
	`shoe_size_us` real,
	`insole_cm` real,
	`width_inches` real,
	`height_inches` real,
	`depth_inches` real,
	`strap_drop_inches` real,
	`size_note` text,
	`condition` text NOT NULL,
	`individual_cost` real DEFAULT 0 NOT NULL,
	`target_sell_price` real NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`sold_price` real,
	`sold_at` integer,
	`created_at` integer NOT NULL,
	`published_at` integer,
	`shop_code` text,
	`photo_sync` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "session_id", "brand", "name", "department", "category", "ptp_inches", "length_inches", "sleeve_inches", "waist_inches", "inseam_inches", "rise_inches", "leg_opening_inches", "shoe_size_us", "insole_cm", "width_inches", "height_inches", "depth_inches", "strap_drop_inches", "size_note", "condition", "individual_cost", "target_sell_price", "status", "sold_price", "sold_at", "created_at", "published_at", "shop_code", "photo_sync") SELECT "id", "session_id", "brand", "name", "department", "category", "ptp_inches", "length_inches", "sleeve_inches", "waist_inches", "inseam_inches", "rise_inches", "leg_opening_inches", "shoe_size_us", "insole_cm", "width_inches", "height_inches", "depth_inches", "strap_drop_inches", "size_note", "condition", "individual_cost", "target_sell_price", "status", "sold_price", "sold_at", "created_at", "published_at", "shop_code", "photo_sync" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;