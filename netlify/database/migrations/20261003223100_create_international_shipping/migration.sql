CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shipment_id" uuid NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"facility" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"shipment_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"rate_id" uuid NOT NULL,
	"inputs" jsonb NOT NULL,
	"amount" numeric(16,2) NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"service_id" uuid NOT NULL,
	"origin_city" text NOT NULL,
	"destination_country" text NOT NULL,
	"currency" text NOT NULL,
	"base" numeric(16,2) NOT NULL,
	"per_kg" numeric(16,2) NOT NULL,
	"per_package" numeric(16,2) NOT NULL,
	"volumetric_divisor" numeric NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"min_days" integer NOT NULL,
	"max_days" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tracking_number" text NOT NULL UNIQUE,
	"owner_id" uuid NOT NULL,
	"origin_country" text DEFAULT 'RU' NOT NULL,
	"origin_city" text NOT NULL,
	"destination_country" text NOT NULL,
	"destination_city" text NOT NULL,
	"service_id" uuid NOT NULL,
	"details" jsonb NOT NULL,
	"status" text DEFAULT 'Shipment Created' NOT NULL,
	"current_location" text NOT NULL,
	"estimated_delivery" text,
	"customs" jsonb DEFAULT '{"status":"Not submitted","declarationStatus":"Not submitted","reference":"","goodsDescription":"","hold":false,"release":false,"notes":""}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_shipment_idx" ON "tracking_events" ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipments_owner_idx" ON "shipments" ("owner_id");--> statement-breakpoint
CREATE INDEX "shipments_destination_idx" ON "shipments" ("destination_country");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" ("status");--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_shipment_id_shipments_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id");--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_shipment_id_shipments_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id");--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_rate_id_shipping_rates_id_fkey" FOREIGN KEY ("rate_id") REFERENCES "shipping_rates"("id");--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_service_id_shipping_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "shipping_services"("id");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_service_id_shipping_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "shipping_services"("id");