ALTER TABLE "user_settings" ALTER COLUMN "language" SET DEFAULT 'zh-CN';--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "sound_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "vibration_enabled" boolean DEFAULT true NOT NULL;