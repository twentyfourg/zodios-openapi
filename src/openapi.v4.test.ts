import { makeApi } from "@twentyfourg/zodios-core/v4";
import { z } from "zod/v4";
import {
  toOpenApi,
  basicAuthScheme,
  bearerAuthScheme,
  oauth2Scheme,
  openApiBuilder,
} from "./openapi.v4";

const user = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const api = makeApi([
  {
    method: "get",
    path: "/users?filter=:filter#fragment",
    alias: "getUsers",
    description: "Get all users",
    parameters: [
      {
        name: "limit",
        type: "Query",
        description: "Limit the number of users",
        schema: z.number().positive().default(10),
      },
      {
        name: "filter",
        type: "Query",
        description: "Filter users by name",
        schema: z.array(z.string()),
      },
    ],
    response: z.array(user),
    errors: [
      {
        status: 404,
        description: "No users found",
        schema: z.object({
          message: z.literal("No users found"),
        }),
      },
    ],
  },
  {
    method: "post",
    path: "/users/:id",
    alias: "updateUser",
    description: "Update a user",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.string(),
      },
      {
        name: "user",
        type: "Body",
        description: "The user to update",
        schema: user,
      },
    ],
    response: user,
  },
]);

describe("toOpenApi v4", () => {
  const usersPath = "/users?filter={filter}#fragment";

  it("should generate auth schemes", () => {
    expect(bearerAuthScheme()).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    expect(basicAuthScheme()).toEqual({
      type: "http",
      scheme: "basic",
    });
    expect(
      oauth2Scheme({
        implicit: {
          authorizationUrl: "https://example.com/oauth2/authorize",
          scopes: {
            read: "Read access",
          },
        },
      })
    ).toEqual({
      type: "oauth2",
      flows: {
        implicit: {
          authorizationUrl: "https://example.com/oauth2/authorize",
          scopes: {
            read: "Read access",
          },
        },
      },
    });
  });

  it("should convert v4 schemas into an openapi document", () => {
    const openApi = toOpenApi(api, {
      info: {
        title: "My API",
        version: "1.0.0",
      },
    });

    expect(openApi.openapi).toBe("3.0.0");
    expect(openApi.paths[usersPath]?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "filter[]",
          in: "query",
          description: "Filter users by name",
        }),
      ])
    );
    expect(openApi.paths["/users/{id}"]?.post?.requestBody).toEqual(
      expect.objectContaining({
        description: "The user to update",
      })
    );
    expect(openApi.paths[usersPath]?.get?.responses?.["404"]).toEqual(
      expect.objectContaining({
        description: "No users found",
        content: expect.objectContaining({
          "application/json": expect.objectContaining({
            schema: expect.objectContaining({
              properties: expect.objectContaining({
                message: expect.objectContaining({
                  enum: ["No users found"],
                }),
              }),
            }),
          }),
        }),
      })
    );
    expect(JSON.stringify(openApi)).not.toContain("\"$schema\"");
    expect(JSON.stringify(openApi)).not.toContain("\"const\"");
  });

  it("should convert with the builder", () => {
    const openApi = openApiBuilder({
      title: "My API",
      version: "1.0.0",
    })
      .addServer({ url: "/api/v1" })
      .addSecurityScheme("auth", bearerAuthScheme())
      .addProtectedApi("auth", api)
      .build();

    expect(openApi.servers).toEqual([{ url: "/api/v1" }]);
    expect(openApi.components?.securitySchemes).toEqual({
      auth: bearerAuthScheme(),
    });
    expect(openApi.paths[usersPath]?.get?.security).toEqual([{ auth: [] }]);
  });
});
