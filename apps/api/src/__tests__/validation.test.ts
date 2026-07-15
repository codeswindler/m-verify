import { describe, expect, it } from "vitest";
import { createTenantSchema, createUserSchema, loginSchema } from "@m-verify/shared";

describe("business validation", () => {
  it("normalizes uppercase business slugs", () => {
    const business = createTenantSchema.parse({
      name: "Test Business",
      slug: "Test-Business",
      commissionRatePct: 0,
      contactEmail: "test123@gmail.com",
      contactPhone: "0712345678"
    });

    expect(business.slug).toBe("test-business");
  });

  it("still rejects unsafe slug characters", () => {
    const result = createTenantSchema.safeParse({
      name: "Test Business",
      slug: "test business"
    });

    expect(result.success).toBe(false);
  });
});

describe("staff password validation", () => {
  it("accepts four-character passwords for creation and login", () => {
    expect(createUserSchema.safeParse({
      username: "test-admin",
      fullName: "Test Admin",
      role: "manager",
      password: "1234"
    }).success).toBe(true);

    expect(loginSchema.safeParse({
      username: "test-admin",
      password: "1234",
      deviceId: "test-device"
    }).success).toBe(true);
  });
});
