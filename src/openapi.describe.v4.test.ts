import { makeApi } from "@zodios/core/v4";
import { z } from "zod/v4";
import { toOpenApi } from "./openapi.v4";

const user = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const api = makeApi([
  {
    method: "get",
    path: "/users",
    alias: "getUsers",
    description: "Get all users",
    parameters: [
      {
        name: "limit",
        type: "Query",
        schema: z
          .number()
          .positive()
          .default(10)
          .describe("Limit the number of users"),
      },
    ],
    response: z.array(user).describe("User list"),
    errors: [
      {
        status: "default",
        schema: z
          .object({
            message: z.string(),
          })
          .describe("Default error"),
      },
    ],
  },
  {
    method: "post",
    path: "/users",
    alias: "createUser",
    parameters: [
      {
        name: "user",
        type: "Body",
        schema: user.omit({ id: true }).describe("The user to create"),
      },
    ],
    response: user.describe("Created user"),
  },
]);

describe("toOpenApi v4 descriptions", () => {
  it("should preserve described schemas", () => {
    const openApi = toOpenApi(api, {
      info: {
        title: "My API",
        version: "1.0.0",
      },
    });

    expect(openApi.paths["/users"]?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "limit",
          description: "Limit the number of users",
        }),
      ])
    );
    expect(openApi.paths["/users"]?.get?.responses?.["200"]).toEqual(
      expect.objectContaining({
        description: "User list",
      })
    );
    expect(openApi.paths["/users"]?.get?.responses?.default).toEqual(
      expect.objectContaining({
        description: "Default error",
      })
    );
    expect(openApi.paths["/users"]?.post?.requestBody).toEqual(
      expect.objectContaining({
        description: "The user to create",
      })
    );
  });
});
