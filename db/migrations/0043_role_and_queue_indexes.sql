CREATE INDEX "service_requests_category_status_idx" ON "service_requests" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");