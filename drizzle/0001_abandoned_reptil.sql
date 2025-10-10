CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"language" text DEFAULT 'en-US' NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "signature" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "persona" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "avatar_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "character" ALTER COLUMN "visibility" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ALTER COLUMN "avatar_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ALTER COLUMN "last_message" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "chat" ALTER COLUMN "last_message" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;